import * as A from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as M from "effect/MutableHashMap";
import * as H from "effect/MutableHashSet";
import * as O from "effect/Option";
import * as Order from "effect/Order";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { CoreMetadataJson, decodeVideoInfo } from "./CoreMetadata.model.js";
import { DownloadArguments } from "./DownloadArguments.service.js";
import { BoundaryDecodeError, InvalidDownload as InvalidDownloadError, MetadataFailure } from "./Downloader.errors.js";
import { Downloader } from "./Downloader.service.js";
import { DownloaderHost } from "./DownloaderHost.service.js";
import { DownloadTiming } from "./DownloadTiming.service.js";
import { PlaylistInfo } from "./MediaInfo.model.js";
import { mapPlaylistInfo, planPlaylistDownloadOrder } from "./playlist-plan.js";
import { YtDlpProcess } from "./YtDlpProcess.service.js";
import { formatYtDlpCommand, isTransientYtDlpNetworkError } from "./yt-dlp-args.js";
import type { HostFailure, InvalidDownload } from "./Downloader.errors.js";
import type { ProcessRun } from "./DownloadProcess.service.js";
import type {
  CreateDownloadInput,
  DownloadRuntimeSettings,
  DownloadTask,
  PlaylistDownloadInput,
  VideoFormat,
} from "./types.js";

const terminal = (task: DownloadTask): boolean =>
  task.status === "completed" || task.status === "error" || task.status === "cancelled";
const formatCopy = (format: VideoFormat | undefined): VideoFormat | undefined =>
  format === undefined ? undefined : { ...format };
const cloneTask = (task: DownloadTask): DownloadTask => ({
  ...task,
  progress: task.progress === undefined ? undefined : { ...task.progress },
  tags: task.tags === undefined ? undefined : [...task.tags],
  selectedFormat: formatCopy(task.selectedFormat),
});
const clamp = (value: unknown): number =>
  typeof value !== "number" || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
const trimLog = (value: string): string => (value.length <= 80000 ? value : Str.slice(value.length - 80000)(value));
const savedPath = (text: string): string | undefined => {
  const log = Str.trim(text);
  if (log.length === 0) return undefined;
  for (const pattern of [
    /Merging formats into "([^"]+)"/g,
    /Destination:\s+"([^"]+)"/g,
    /Destination:\s+'([^']+)'/g,
    /\[download\]\s+([^\r\n]+?)\s+has already been downloaded/g,
  ]) {
    const matches = Array.from(Str.matchAll(pattern)(log));
    const match = A.last(matches);
    const candidate = O.isSome(match) ? match.value[1] : undefined;
    if (candidate !== undefined && Str.trim(candidate).length > 0) return Str.trim(candidate);
  }
  for (const line of A.reverse(Str.split(log, /\r?\n/))) {
    const at = O.getOrElse(Str.indexOf("Destination:")(line), () => -1);
    const candidate = at < 0 ? "" : Str.trim(Str.slice(at + "Destination:".length)(line));
    if (candidate.length > 0) return candidate;
  }
  return undefined;
};

/** Native Core orchestration, including metadata and playlist admission. */
export const layer = Layer.effect(
  Downloader,
  Effect.gen(function* () {
    const host = yield* DownloaderHost;
    const process = yield* YtDlpProcess;
    const timing = yield* DownloadTiming;
    const path = yield* Path.Path;
    const argumentsService = yield* DownloadArguments;
    const tasks = M.empty<string, DownloadTask>();
    const inputs = M.empty<string, CreateDownloadInput>();
    const active = M.empty<
      string,
      { readonly run: ProcessRun; readonly abort: Effect.Effect<void>; readonly signal: AbortSignal }
    >();
    const history = M.empty<string, DownloadTask>();
    const cancelled = H.empty<string>();
    const taskOrder: string[] = [];
    const historyOrder: string[] = [];
    const pending: string[] = [];
    const getTask = (id: string) => O.getOrUndefined(M.get(tasks, id));
    const listDownloads = Effect.sync(() =>
      A.map(
        A.sort(
          A.filter(
            A.flatMap(taskOrder, (id) => O.match(M.get(tasks, id), { onNone: () => [], onSome: (task) => [task] })),
            (task) => !terminal(task)
          ),
          (a: DownloadTask, b: DownloadTask) => Order.Number(b.createdAt, a.createdAt)
        ),
        cloneTask
      )
    );
    const listHistory = Effect.sync(() =>
      A.map(
        A.sort(
          A.flatMap(historyOrder, (id) => O.match(M.get(history, id), { onNone: () => [], onSome: (task) => [task] })),
          (a: DownloadTask, b: DownloadTask) => Order.Number(b.completedAt ?? b.createdAt, a.completedAt ?? a.createdAt)
        ),
        cloneTask
      )
    );
    const publishHistory = Effect.fn("Downloader.publishHistory")(function* () {
      const value = yield* listHistory;
      yield* host.emit({ type: "history-updated", value });
    });
    const queueEvent = Effect.fn("Downloader.queueEvent")(function* () {
      const value = yield* listDownloads;
      yield* host.emit({ type: "queue-updated", value });
    });
    const update = Effect.fn("Downloader.update")(function* (id: string, patch: Partial<DownloadTask>) {
      const old = getTask(id);
      if (old === undefined) return null;
      const next = { ...old, ...patch };
      M.set(tasks, id, next);
      if (terminal(next)) {
        if (!M.has(history, id)) historyOrder.push(id);
        M.set(history, id, next);
        M.remove(inputs, id);
        yield* publishHistory();
      }
      const snapshot = cloneTask(next);
      yield* host.emit({ type: "task-updated", value: snapshot });
      yield* queueEvent();
      return snapshot;
    });
    const settingsFor = (settings?: DownloadRuntimeSettings): DownloadRuntimeSettings => {
      const requested = settings?.downloadPath === undefined ? "" : Str.trim(settings.downloadPath);
      const fallback =
        host.runtimeSettings.downloadPath === undefined ? "" : Str.trim(host.runtimeSettings.downloadPath);
      return {
        ...host.runtimeSettings,
        ...settings,
        downloadPath: requested.length > 0 ? requested : fallback.length > 0 ? fallback : host.downloadDir,
      };
    };
    const pump: () => Effect.Effect<void, HostFailure | InvalidDownload> = Effect.fn("Downloader.processQueue")(
      function* () {
        if (M.size(active) >= host.maxConcurrent) return;
        const id = pending.shift();
        if (id === undefined || id.length === 0) return;
        const task = getTask(id);
        if (task === undefined) {
          yield* pump();
          return;
        }
        const input = O.getOrUndefined(M.get(inputs, id));
        if (input === undefined) {
          yield* update(id, { status: "error", completedAt: host.now(), error: "Missing download input" });
          yield* pump();
          return;
        }
        const settings = settingsFor(input.settings);
        const customPath = input.customDownloadPath === undefined ? "" : Str.trim(input.customDownloadPath);
        const resolvedPath = customPath.length > 0 ? customPath : (settings.downloadPath ?? host.downloadDir);
        const built = argumentsService.download(
          {
            url: task.url,
            type: input.type,
            format: input.format,
            audioFormat: input.audioFormat,
            audioFormatIds: input.audioFormatIds,
            startTime: input.startTime,
            endTime: input.endTime,
            customDownloadPath: input.customDownloadPath,
            customFilenameTemplate: input.customFilenameTemplate,
            containerFormat: input.containerFormat,
          },
          host.downloadDir,
          settings,
          host.jsRuntimeArgs
        );
        const args = yield* built;
        const url = args.pop();
        if (url === undefined || url.length === 0) {
          yield* update(id, { status: "error", completedAt: host.now(), error: "Download arguments missing URL" });
          yield* pump();
          return;
        }
        const initialized = yield* host.initialize;
        if (initialized.ffmpeg === undefined || initialized.ffmpeg.length === 0) {
          yield* update(id, {
            status: "error",
            completedAt: host.now(),
            error: "ffmpeg/ffprobe not found. Use Desktop resources/ffmpeg, install in PATH, or set FFMPEG_PATH.",
          });
          yield* pump();
          return;
        }
        args.push("--ffmpeg-location", initialized.ffmpeg, url);
        const controller = yield* host.cancellation;
        let log = "";
        let logsBound = false;
        let callbacksBound = false;
        let settled = false;
        let acquiredRun: ProcessRun | undefined;
        const nativeAbort = Effect.suspend(() =>
          acquiredRun === undefined ? Effect.void : acquiredRun.signalChild("SIGTERM").pipe(Effect.ignore)
        );
        const isCancelled = () => controller.signal.aborted || H.has(cancelled, id);
        const finish = Effect.fn("Downloader.finalize")(function* (
          patch: Pick<DownloadTask, "status"> & Partial<DownloadTask>
        ) {
          if (settled) return;
          settled = true;
          M.remove(active, id);
          H.remove(cancelled, id);
          const final: Partial<DownloadTask> = {
            ...patch,
            completedAt: patch.completedAt ?? host.now(),
            ytDlpLog: log,
          };
          const saved = savedPath(log);
          if (saved !== undefined) {
            final.savedFileName = path.basename(saved);
            final.downloadPath = path.dirname(saved);
          } else final.downloadPath = resolvedPath;
          yield* update(id, final);
          yield* pump().pipe(Effect.orDie);
        });
        const started = yield* process.start(
          {
            command: initialized.binary,
            argv: args,
            env: undefined,
            extendEnv: true,
            cwd: undefined,
            detached: host.platform !== "win32",
            windowsHide: false,
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
            abortSignal: controller.signal,
          },
          {
            abort: nativeAbort,
            emit: Effect.fn("Downloader.output")(function* (event) {
              if ((event._tag === "stdout" || event._tag === "stderr") && logsBound)
                log = trimLog(log + new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk));
              if (!callbacksBound) return;
              if (event._tag === "progress") {
                yield* update(id, {
                  progress: {
                    percent: clamp(event.payload.percent),
                    currentSpeed: event.payload.currentSpeed,
                    eta: event.payload.eta,
                    downloaded: event.payload.downloaded,
                    total: event.payload.total,
                  },
                  speed: event.payload.currentSpeed,
                });
              } else if (event._tag === "close") {
                if (isCancelled()) yield* finish({ status: "cancelled", progress: { percent: 0 } });
                else if (event.code === 0) yield* finish({ status: "completed", progress: { percent: 100 } });
                else yield* finish({ status: "error", error: `yt-dlp exited with code ${event.code ?? -1}` });
              } else if (event._tag === "error") {
                if (isCancelled()) yield* finish({ status: "cancelled", progress: { percent: 0 } });
                else
                  yield* finish({
                    status: "error",
                    error: event.error instanceof Error ? event.error.message : String(event.error),
                  });
              }
            }),
          }
        );
        if (started._tag === "NativeSpawnFailure") {
          yield* finish(
            isCancelled()
              ? { status: "cancelled", progress: { percent: 0 } }
              : { status: "error", error: started.error.message }
          );
          return;
        }
        acquiredRun = started.run;
        if (controller.signal.aborted) yield* nativeAbort;
        yield* host.lowerPriority(started.run.pid);
        M.set(active, id, { run: started.run, ...controller });
        logsBound = true;
        yield* update(id, {
          status: "downloading",
          startedAt: host.now(),
          progress: { percent: 0 },
          ytDlpCommand: formatYtDlpCommand(args),
          ytDlpLog: "",
        });
        callbacksBound = true;
        yield* pump();
      }
    );
    const createDownload = Effect.fn("Downloader.createDownload")(function* (input: CreateDownloadInput) {
      yield* host.initialize;
      yield* timing.turn("core.initialize");
      const id = host.uuid();
      const settings = settingsFor(input.settings);
      const custom = input.customDownloadPath === undefined ? "" : Str.trim(input.customDownloadPath);
      const customTemplate = input.customFilenameTemplate === undefined ? "" : Str.trim(input.customFilenameTemplate);
      const task: DownloadTask = {
        id,
        url: input.url,
        title: input.title,
        thumbnail: input.thumbnail,
        type: input.type,
        status: "pending",
        createdAt: host.now(),
        duration: input.duration,
        description: input.description,
        channel: input.channel,
        uploader: input.uploader,
        viewCount: input.viewCount,
        tags: input.tags === undefined ? undefined : [...input.tags],
        selectedFormat: formatCopy(input.selectedFormat),
        playlistId: input.playlistId,
        playlistTitle: input.playlistTitle,
        playlistIndex: input.playlistIndex,
        playlistSize: input.playlistSize,
        downloadPath: custom.length > 0 ? custom : (settings.downloadPath ?? host.downloadDir),
      };
      if (!M.has(tasks, id)) taskOrder.push(id);
      M.set(tasks, id, task);
      M.set(inputs, id, {
        ...input,
        selectedFormat: formatCopy(input.selectedFormat),
        customDownloadPath: custom.length > 0 ? custom : undefined,
        customFilenameTemplate: customTemplate.length > 0 ? customTemplate : undefined,
        settings,
      });
      pending.push(id);
      yield* queueEvent();
      yield* pump();
      return cloneTask(task);
    });
    const jsonCommand = Effect.fn("Downloader.jsonCommand")(function* (args: string[]) {
      const initialized = yield* host.initialize;
      const done = yield* Deferred.make<unknown, MetadataFailure>();
      let stdout = "";
      let stderr = "";
      const started = yield* process.start(
        {
          command: initialized.binary,
          argv: args,
          env: undefined,
          extendEnv: true,
          cwd: undefined,
          detached: false,
          windowsHide: false,
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          abort: Effect.void,
          emit: Effect.fn("Downloader.metadataOutput")(function* (event) {
            if (event._tag === "stdout") stdout += new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
            else if (event._tag === "stderr")
              stderr += new TextDecoder("utf-8", { ignoreBOM: true }).decode(event.chunk);
            else if (event._tag === "error")
              yield* Deferred.fail(
                done,
                MetadataFailure.make({
                  operation: "metadata",
                  legacyMessage: event.error instanceof Error ? event.error.message : String(event.error),
                  cause: event.error,
                })
              );
            else if (event._tag === "close") {
              if (event.code !== 0 || Str.trim(stdout).length === 0)
                yield* Deferred.fail(
                  done,
                  MetadataFailure.make({
                    operation: "metadata",
                    legacyMessage: Str.trim(stderr) || `yt-dlp exited with code ${event.code ?? -1}`,
                  })
                );
              else {
                const decoded = S.decodeEffect(CoreMetadataJson)(stdout).pipe(
                  Effect.mapError(() =>
                    MetadataFailure.make({
                      operation: "json",
                      legacyMessage: host.jsonSyntaxMessage(stdout),
                      jsonInput: stdout,
                    })
                  )
                );
                yield* Deferred.complete(done, decoded);
              }
            }
          }),
        }
      );
      if (started._tag === "NativeSpawnFailure")
        return yield* MetadataFailure.make({
          operation: "metadata",
          legacyMessage: started.error.message,
          cause: started.error,
        });
      yield* host.lowerPriority(started.run.pid);
      return yield* Deferred.await(done);
    });
    const metadata = Effect.fn("Downloader.metadata")(function* (
      url: string,
      settings: DownloadRuntimeSettings | undefined,
      playlist: boolean
    ) {
      yield* host.initialize;
      yield* timing.turn("core.initialize");
      const target = Str.trim(url);
      if (target.length === 0)
        return yield* InvalidDownloadError.make({ operation: "metadata", legacyMessage: "URL is required." });
      const command = Effect.fn("Downloader.metadataAttempt")(function* () {
        const args = yield* (playlist ? argumentsService.playlistInfo : argumentsService.videoInfo)(
          target,
          settingsFor(settings),
          host.jsRuntimeArgs
        );
        return yield* jsonCommand(args);
      });
      const attempt = (number: number): Effect.Effect<unknown, HostFailure | InvalidDownload | MetadataFailure> =>
        command().pipe(
          Effect.catchIf(
            (error) => number < 3 && isTransientYtDlpNetworkError(error.legacyMessage),
            () => timing.sleep(1000).pipe(Effect.andThen(() => attempt(number + 1)))
          )
        );
      return { raw: yield* attempt(1), target };
    });
    const getVideoInfo = Effect.fn("Downloader.getVideoInfo")(function* (
      url: string,
      settings?: DownloadRuntimeSettings
    ) {
      const { raw, target } = yield* metadata(url, settings, false);
      return yield* decodeVideoInfo(raw, target);
    });
    const getPlaylistInfo = Effect.fn("Downloader.getPlaylistInfo")(function* (
      url: string,
      settings?: DownloadRuntimeSettings
    ) {
      const { raw, target } = yield* metadata(url, settings, true);
      if (raw === null)
        return yield* MetadataFailure.make({
          operation: "playlist",
          legacyMessage: "Cannot read properties of null (reading 'entries')",
          cause: new TypeError("Cannot read properties of null (reading 'entries')"),
        });
      const document = yield* S.decodeUnknownEffect(S.Record(S.String, S.Unknown))(
        typeof raw === "object" && !A.isArray(raw) ? raw : {}
      ).pipe(
        Effect.mapError(() =>
          BoundaryDecodeError.make({ operation: "playlist", legacyMessage: "Invalid yt-dlp metadata." })
        )
      );
      const mapped = yield* Effect.try({
        try: () => mapPlaylistInfo(document, target),
        catch: (cause) =>
          MetadataFailure.make({
            operation: "playlist",
            legacyMessage: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      });
      return yield* S.decodeEffect(PlaylistInfo)(mapped).pipe(
        Effect.mapError(() =>
          BoundaryDecodeError.make({ operation: "playlist", legacyMessage: "Invalid yt-dlp metadata." })
        )
      );
    });
    const startPlaylistDownload = Effect.fn("Downloader.startPlaylistDownload")(function* (
      input: PlaylistDownloadInput
    ) {
      const playlist = yield* getPlaylistInfo(input.url, input.settings);
      const groupId = `playlist_group_${host.now()}_${Str.slice(2, 8)(host.random().toString(36))}`;
      const ids = H.fromIterable(input.entryIds ?? []);
      const requestedStart = Math.max((input.startIndex ?? 1) - 1, 0);
      const hasEnd = Boolean(input.endIndex);
      const requestedEnd = hasEnd
        ? Math.min((input.endIndex ?? 0) - 1, playlist.entryCount - 1)
        : playlist.entryCount - 1;
      const selected =
        playlist.entryCount === 0
          ? []
          : input.entryIds != null && input.entryIds.length > 0
            ? A.filter(playlist.entries, (entry) => H.has(ids, entry.id))
            : playlist.entries.slice(
                Math.min(requestedStart, requestedEnd),
                Math.max(requestedStart, requestedEnd) + 1
              );
      const entries = yield* Effect.forEach(
        planPlaylistDownloadOrder(selected),
        Effect.fn("Downloader.playlistEntry")(function* (entry) {
          const download = yield* createDownload({
            url: entry.url,
            type: input.type,
            title: entry.title,
            thumbnail: entry.thumbnail,
            playlistId: groupId,
            playlistTitle: playlist.title,
            playlistIndex: entry.index,
            playlistSize: selected.length,
            format: input.format,
            audioFormat: input.audioFormat,
            audioFormatIds: input.audioFormatIds,
            customDownloadPath: input.customDownloadPath,
            customFilenameTemplate: input.customFilenameTemplate,
            containerFormat: input.containerFormat,
            settings: input.settings,
          });
          yield* timing.turn("core.playlistEntry");
          return { downloadId: download.id, entryId: entry.id, title: entry.title, url: entry.url, index: entry.index };
        }),
        { concurrency: 1 }
      );
      return {
        groupId,
        playlistId: playlist.id,
        playlistTitle: playlist.title,
        type: input.type,
        totalCount: selected.length,
        startIndex: selected[0]?.index ?? 0,
        endIndex: selected.at(-1)?.index ?? 0,
        entries,
      };
    });
    const removeHistoryItems = Effect.fn("Downloader.removeHistoryItems")(function* (ids: string[]) {
      let removed = 0;
      for (const raw of ids) {
        const id = Str.trim(raw);
        if (id.length === 0 || !M.has(history, id)) continue;
        M.remove(history, id);
        const historyIndex = O.getOrElse(
          A.findFirstIndex(historyOrder, (key) => key === id),
          () => -1
        );
        if (historyIndex >= 0) historyOrder.splice(historyIndex, 1);
        removed++;
        const task = getTask(id);
        if (task !== undefined && terminal(task)) {
          M.remove(tasks, id);
          const taskIndex = O.getOrElse(
            A.findFirstIndex(taskOrder, (key) => key === id),
            () => -1
          );
          if (taskIndex >= 0) taskOrder.splice(taskIndex, 1);
        }
      }
      if (removed > 0) yield* publishHistory();
      return removed;
    });
    return Downloader.of({
      getVideoInfo,
      getPlaylistInfo,
      startPlaylistDownload,
      initialize: Effect.asVoid(host.initialize),
      createDownload,
      listDownloads,
      listHistory,
      getStatus: Effect.sync(() => ({ active: M.size(active), pending: pending.length })),
      cancelDownload: Effect.fn("Downloader.cancelDownload")(function* (id) {
        const run = O.getOrUndefined(M.get(active, id));
        if (run !== undefined) {
          H.add(cancelled, id);
          yield* run.abort;
          return true;
        }
        const index = O.getOrElse(
          A.findFirstIndex(pending, (value) => value === id),
          () => -1
        );
        if (index >= 0) {
          pending.splice(index, 1);
          yield* update(id, { status: "cancelled", completedAt: host.now() });
          return true;
        }
        return false;
      }),
      removeHistoryItems,
      removeHistoryByPlaylist: Effect.fn("Downloader.removeHistoryByPlaylist")(function* (raw) {
        const id = Str.trim(raw);
        if (id.length === 0) return 0;
        const ids = A.filter(historyOrder, (key) => O.getOrUndefined(M.get(history, key))?.playlistId === id);
        return yield* removeHistoryItems(ids);
      }),
    });
  })
);
