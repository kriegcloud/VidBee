import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import * as Arr from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Str from "effect/String";
import { ASR_TIER_IDS, asrTierInfo } from "./asr-tiers.js";
import { modelDownloadUrls } from "./download-mirrors.js";
import { ModelFileIO, ModelFiles } from "./ModelFiles.service.js";
import { ModelHttp } from "./ModelHttp.service.js";
import { withModelCleanup } from "./ModelLifetime.js";
import { Models, ModelsHooks } from "./Models.service.js";
import { catalogFor, MODEL_CATALOG, modelVersion } from "./model-catalog.js";
import { INCOMPLETE_MODEL_ERROR } from "./qwen3-tokenizer.js";
import { ModelBusy, ModelIntegrityFailure, ModelUnavailable } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import type { AsrTierId, ModelGroup, ModelRole } from "./Literal.model.js";
import type { AsrTierStatus, ModelDownloadProgress, ModelFileSpec, ModelStatus } from "./Model.model.js";
import type { EnsureReadyOptions, ModelsOptions } from "./ModelFiles.model.js";
import type { ModelStatusSink } from "./Models.service.js";
import type { HostFailure, TranscriptionError } from "./Transcription.errors.js";

const archiveUrl = (url: string): boolean => /\.(tar\.bz2|tar\.gz|tgz|tbz2)$/i.test(url);
const cancelled = (error: TranscriptionError): boolean => {
  const original = "cause" in error ? error.cause : undefined;
  return (
    (original instanceof Error && original.name === "AbortError") ||
    /download cancelled|operation was aborted/i.test(error.legacyMessage)
  );
};
export const makeModelsLayer = (options: ModelsOptions) =>
  Layer.effect(
    Models,
    Effect.gen(function* () {
      const files = yield* TranscriptionFiles;
      const modelFiles = yield* ModelFiles;
      const io = yield* ModelFileIO;
      const http = yield* ModelHttp;
      const time = yield* TranscriptionTime;
      const hooks = yield* ModelsHooks;
      const path = yield* Path.Path;
      const owner = yield* Effect.scope;
      const timing = yield* LegacyTiming;
      const catalog = options.catalog ?? MODEL_CATALOG;
      const modelsDir = options.modelsDir;
      yield* files.mkdir(modelsDir, true);
      let inflight = HashMap.empty<string, Deferred.Deferred<void, TranscriptionError>>();
      let progress = HashMap.empty<string, ModelDownloadProgress>();
      let progressOrder: string[] = [];
      let counts = HashMap.empty<AsrTierId, number>();
      let controllers = HashMap.empty<AsrTierId, AbortController>();
      let activeTiers: readonly AsrTierId[] = [];
      let lastEmit = 0;
      let listeners: Array<{ sink: ModelStatusSink; active: boolean }> = [];
      let emitting = 0;
      const awaitInternal = Effect.fn("Models.awaitInternal")(
        <A, E>(point: string, effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
          effect.pipe(
            Effect.exit,
            Effect.flatMap((exit) => timing.turn(point).pipe(Effect.andThen(exit)))
          )
      );
      const get = <K, V>(map: HashMap.HashMap<K, V>, key: K): V | undefined =>
        Option.getOrUndefined(HashMap.get(map, key));
      const pathFor = (spec: Pick<ModelFileSpec, "fileName">): string => path.join(modelsDir, spec.fileName);
      const archiveName = (url: string): string => {
        try {
          return path.basename(new URL(url).pathname);
        } catch {
          return path.basename(url);
        }
      };
      const locations = (url: string) => {
        const archivePath = path.join(modelsDir, ".downloads", archiveName(url));
        return { archivePath, marker: `${archivePath}.extracted` };
      };
      const sharedSpecs = (url: string): readonly ModelFileSpec[] =>
        Arr.filter(catalog, (spec) => archiveUrl(spec.url) && archiveName(spec.url) === archiveName(url));
      const rootFor = (spec: ModelFileSpec): string => {
        const parts = Arr.filter(Str.split(/[/\\]/)(spec.fileName), Boolean);
        return parts.length <= 1 ? pathFor(spec) : path.join(modelsDir, parts[0] ?? spec.fileName);
      };
      const wanted = (groups?: readonly ModelGroup[], tiers?: readonly AsrTierId[]): readonly ModelFileSpec[] => {
        if (catalog === MODEL_CATALOG)
          return catalogFor({ ...(groups === undefined ? {} : { groups }), ...(tiers === undefined ? {} : { tiers }) });
        return Arr.filter(catalog, (spec) => {
          if (
            Boolean(groups) === true &&
            groups !== undefined &&
            groups.length > 0 &&
            !Arr.contains(groups, spec.group)
          )
            return false;
          if (
            Boolean(spec.tier) === true &&
            spec.tier !== undefined &&
            Boolean(tiers) === true &&
            tiers !== undefined &&
            tiers.length > 0 &&
            !Arr.contains(tiers, spec.tier)
          )
            return false;
          if (Boolean(spec.tier) === true && (tiers === undefined || !(Boolean(tiers) === true) || tiers.length === 0))
            return false;
          return true;
        });
      };
      const checkAbort = Effect.fn("Models.checkAbort")(function* (signal: AbortSignal | undefined, tier?: AsrTierId) {
        if (signal?.aborted === true) {
          const message = Boolean(tier) === true ? `download cancelled: ${tier}` : "download cancelled";
          return yield* ModelUnavailable.make({
            operation: "cancel",
            legacyMessage: message,
            cause: Object.assign(new Error(message), { name: "AbortError" }),
          });
        }
      });
      const assess = Effect.fn("Models.assess")((spec: ModelFileSpec) => modelFiles.assess(spec, pathFor(spec)));
      const tierStatus = Effect.fn("Models.tierStatus")(function* (
        id: AsrTierId
      ): Effect.fn.Return<AsrTierStatus, HostFailure> {
        const specs = wanted(["asr"], [id]);
        const states = yield* Effect.forEach(specs, assess, { concurrency: 1 });
        const info = asrTierInfo(id);
        return {
          id,
          family: info.family,
          ready: states.length > 0 && Arr.every(states, (item) => item.present && item.bytes > 0),
          bytes: Arr.reduce(states, 0, (sum, item) => sum + item.bytes),
          qualityRank: info.qualityRank,
        };
      });
      const fileStatus = Effect.fn("Models.fileStatus")(function* (spec: ModelFileSpec) {
        const state = yield* assess(spec);
        return { id: spec.id, present: state.present, path: pathFor(spec), bytes: state.bytes };
      });
      const status = Effect.fn("Models.status")(function* (
        groups?: readonly ModelGroup[],
        tiers?: readonly AsrTierId[]
      ): Effect.fn.Return<ModelStatus, HostFailure> {
        const occupancy = !(Boolean(groups) || Boolean(tiers));
        const specs = occupancy ? catalog : wanted(groups, tiers);
        const visible = yield* Effect.forEach(specs, fileStatus, { concurrency: 1 });
        const readiness = yield* Effect.forEach(
          occupancy ? wanted(["vad", "speaker", "asr"], ["minimal"]) : specs,
          assess,
          { concurrency: 1 }
        );
        const downloads: ModelDownloadProgress[] = [];
        for (const key of progressOrder) {
          const entry = get(progress, key);
          if (entry !== undefined) downloads.push(entry);
        }
        return {
          ready: Arr.every(readiness, (info) => info.present && info.bytes > 0),
          version: modelVersion,
          bytes: Arr.reduce(visible, 0, (sum, item) => sum + item.bytes),
          files: visible,
          tiers: yield* Effect.forEach(ASR_TIER_IDS, tierStatus, { concurrency: 1 }),
          downloading: downloads[0] ?? null,
          downloads,
        };
      });
      const emitProgress = Effect.fn("Models.emitProgress")(function* (
        force?: boolean
      ): Effect.fn.Return<void, HostFailure> {
        if (!Arr.some(listeners, (entry) => entry.active)) return;
        const now = yield* time.now;
        if (force !== true && now - lastEmit < 200) return;
        lastEmit = now;
        const snapshot = yield* status();
        emitting += 1;
        const emitAll = Effect.fnUntraced(function* () {
          for (let index = 0; index < listeners.length; index += 1) {
            const entry = listeners[index];
            if (entry?.active === true) yield* entry.sink.emit(snapshot);
          }
        });
        yield* withModelCleanup(
          emitAll(),
          Effect.sync(() => {
            emitting -= 1;
            if (emitting === 0) listeners = Arr.filter(listeners, (entry) => entry.active);
          })
        );
      });
      const incomplete = Effect.fn("Models.incomplete")(function* (tier?: AsrTierId) {
        for (const spec of catalog) {
          if (Boolean(spec.tier) === true && Boolean(tier) === true && spec.tier !== tier) continue;
          if (spec.directoryMembers === undefined || spec.directoryMembers.length === 0) continue;
          const state = yield* assess(spec);
          if (Boolean(state.issue) === true) return state.issue;
        }
        return null;
      });
      const outputReady = Effect.fn("Models.outputReady")(function* (url: string) {
        const specs = sharedSpecs(url);
        for (const spec of specs) {
          if (!(yield* assess(spec)).present) return false;
        }
        return specs.length > 0;
      });
      const shared = Effect.fn("Models.shared")(function* (key: string, work: Effect.Effect<void, TranscriptionError>) {
        const existing = get(inflight, key);
        if (existing !== undefined) {
          yield* Deferred.await(existing);
          return;
        }
        const pending = yield* Deferred.make<void, TranscriptionError>();
        inflight = HashMap.set(inflight, key, pending);
        const completed = withModelCleanup(
          work,
          Effect.sync(() => {
            inflight = HashMap.remove(inflight, key);
          })
        ).pipe(
          Effect.exit,
          Effect.flatMap((exit) => Deferred.done(pending, exit))
        );
        yield* Effect.forkIn(completed, owner, { startImmediately: true });
        yield* Deferred.await(pending);
      });
      const lock = <A>(
        archive: string,
        body: Effect.Effect<A, TranscriptionError>
      ): Effect.Effect<A, TranscriptionError> =>
        Effect.uninterruptibleMask((restore) =>
          awaitInternal("models.withArchiveLock.acquire", modelFiles.acquireArchiveLock(`${archive}.lock`)).pipe(
            Effect.andThen(
              withModelCleanup(
                restore(awaitInternal("models.withArchiveLock.body", body)),
                modelFiles.releaseArchiveLock(`${archive}.lock`)
              )
            )
          )
        );
      const purge = Effect.fn("Models.purge")(function* (tier: AsrTierId) {
        const roots: string[] = [];
        let seenRoots = HashSet.empty<string>();
        const archives: string[] = [];
        let seenArchives = HashSet.empty<string>();
        for (const spec of wanted(["asr"], [tier])) {
          const destination = pathFor(spec);
          if (yield* files.exists(destination)) yield* files.remove(destination, true, true);
          yield* modelFiles.removePartFiles(destination);
          const root = rootFor(spec);
          if (!HashSet.has(seenRoots, root)) {
            seenRoots = HashSet.add(seenRoots, root);
            roots.push(root);
          }
          if (archiveUrl(spec.url) && !HashSet.has(seenArchives, spec.url)) {
            seenArchives = HashSet.add(seenArchives, spec.url);
            archives.push(spec.url);
          }
        }
        for (const root of roots) {
          if (root !== modelsDir && (yield* files.exists(root))) yield* files.remove(root, true, true);
        }
        for (const url of archives) {
          const archive = path.join(modelsDir, ".downloads", path.basename(new URL(url).pathname));
          for (const leftover of [archive, `${archive}.extracted`])
            if (yield* files.exists(leftover)) yield* files.remove(leftover, false, true);
          yield* modelFiles.removePartFiles(archive);
        }
      });
      const checksumFor = Effect.fn("Models.checksumFor")(function* (spec: ModelFileSpec) {
        if (!(Boolean(spec.checksumManifest) === true)) return spec.sha256;
        const manifest = Option.getOrUndefined(
          Arr.findFirst(catalog, (item) => item.fileName === spec.checksumManifest)
        );
        if (manifest === undefined || !(Boolean(manifest.sha256) === true))
          return yield* ModelIntegrityFailure.make({
            operation: "checksumFor",
            legacyMessage: `missing pinned checksum manifest for ${spec.id}`,
          });
        const contents = yield* io.readManifest(pathFor(manifest));
        if ((yield* io.digest(contents)) !== manifest.sha256)
          return yield* ModelIntegrityFailure.make({
            operation: "checksumFor",
            legacyMessage: `model checksum mismatch for ${manifest.url}`,
          });
        const parsed = yield* io.parseJson(new TextDecoder("utf-8", { ignoreBOM: true }).decode(contents));
        const candidates =
          typeof parsed === "object" && parsed !== null && "files" in parsed && Arr.isArray(parsed.files)
            ? parsed.files
            : [];
        const entry = Option.getOrUndefined(
          Arr.findFirst(
            candidates,
            (item) =>
              typeof item === "object" && item !== null && "path" in item && item.path === path.basename(spec.fileName)
          )
        );
        if (
          typeof entry !== "object" ||
          entry === null ||
          !("sha256" in entry) ||
          typeof entry.sha256 !== "string" ||
          !/^[a-f0-9]{64}$/.test(entry.sha256)
        )
          return yield* ModelIntegrityFailure.make({
            operation: "checksumFor",
            legacyMessage: `missing SHA256 in ${manifest.fileName} for ${spec.id}`,
          });
        return entry.sha256;
      });
      const downloadUnlocked = Effect.fn("Models.downloadUnlocked")(function* (
        url: string,
        destination: string,
        sha256: string | undefined,
        tier: AsrTierId | undefined,
        signal: AbortSignal | undefined
      ) {
        yield* checkAbort(signal, tier);
        const response = yield* http.request({
          url,
          method: "GET",
          timeoutMs: options.attemptTimeoutMs ?? 15000,
          ...(signal === undefined ? {} : { signal }),
        });
        if (!(response.ok && response.hasBody))
          return yield* ModelUnavailable.make({
            operation: "download",
            legacyMessage: `network: model download failed for ${url} (${response.status})`,
          });
        const temporary = yield* modelFiles.partPath(destination);
        yield* files.mkdir(path.dirname(destination), true);
        const totalRaw = response.contentLength;
        const total = Boolean(totalRaw) === true ? Number(totalRaw) : Number.NaN;
        const knownTotal = Number.isFinite(total) && total > 0 ? total : null;
        if (!HashMap.has(progress, destination)) progressOrder.push(destination);
        progress = HashMap.set(progress, destination, { url, received: 0, total: knownTotal, tier });
        yield* emitProgress(true);
        let received = 0;
        const streamed = io.stream(
          response,
          temporary,
          signal,
          Boolean(sha256),
          Effect.fn("Models.chunk")(function* (bytes) {
            received += bytes.length;
            progress = HashMap.set(progress, destination, { url, received, total: knownTotal, tier });
            yield* emitProgress();
          })
        );
        const recover = Effect.fn("Models.streamFailure")(function* (error: HostFailure) {
          if (yield* files.exists(temporary)) yield* files.remove(temporary, false, true);
          yield* checkAbort(signal, tier);
          return yield* error;
        });
        const digest = yield* withModelCleanup(
          streamed.pipe(Effect.catch(recover)),
          Effect.sync(() => {
            progress = HashMap.remove(progress, destination);
            progressOrder = Arr.filter(progressOrder, (key) => key !== destination);
          }).pipe(Effect.andThen(emitProgress(true)))
        );
        if (signal?.aborted === true) {
          yield* files.remove(temporary, false, true);
          yield* checkAbort(signal, tier);
        }
        if ((yield* modelFiles.presentBytes(destination)).present) {
          if (yield* files.exists(temporary)) yield* files.remove(temporary, false, true);
          return;
        }
        if (Boolean(sha256) === true && digest !== sha256) {
          yield* files.remove(temporary, false, true);
          return yield* ModelIntegrityFailure.make({
            operation: "checksum",
            legacyMessage: `model checksum mismatch for ${url}`,
          });
        }
        yield* modelFiles.publishFile(temporary, destination);
      });
      const download = Effect.fn("Models.download")(function* (
        url: string,
        destination: string,
        sha256?: string,
        tier?: AsrTierId,
        signal?: AbortSignal
      ) {
        yield* checkAbort(signal, tier);
        const key = `file:${destination}`;
        const pending = get(inflight, key);
        if (pending !== undefined) {
          yield* awaitInternal("models.downloadUrl.shared", Deferred.await(pending));
          yield* checkAbort(signal, tier);
          return;
        }
        if ((yield* modelFiles.presentBytes(destination)).present) return;
        yield* awaitInternal(
          "models.downloadUrl.work",
          shared(key, downloadUnlocked(url, destination, sha256, tier, signal))
        );
      });
      const prepareArchiveBody = Effect.fn("Models.prepareArchiveBody")(function* (
        url: string,
        archive: string,
        marker: string
      ) {
        yield* modelFiles.removeStaleStaging(archive);
        if (yield* outputReady(url)) {
          yield* files.write(marker, "ok");
          return true;
        }
        yield* files.remove(marker, false, true);
        return false;
      });
      const discardArchiveBody = Effect.fn("Models.discardArchiveBody")(function* (
        url: string,
        archive: string,
        marker: string
      ) {
        yield* modelFiles.removeStaleStaging(archive);
        if (yield* outputReady(url)) {
          yield* files.write(marker, "ok");
          return;
        }
        yield* files.remove(marker, false, true);
        if ((yield* modelFiles.liveStaging(archive)).length > 0) return;
        yield* files.remove(archive, false, true);
        yield* modelFiles.removePartFiles(archive);
      });
      const publishArchiveBody = Effect.fn("Models.publishArchiveBody")(function* (
        url: string,
        staging: string,
        marker: string
      ) {
        if (yield* outputReady(url)) {
          yield* files.write(marker, "ok");
          return;
        }
        const roots: string[] = [];
        let seen = HashSet.empty<string>();
        for (const spec of sharedSpecs(url)) {
          const root = Arr.filter(Str.split(/[/\\]/)(spec.fileName), Boolean)[0] ?? spec.fileName;
          if (!HashSet.has(seen, root)) {
            seen = HashSet.add(seen, root);
            roots.push(root);
          }
        }
        for (const root of roots) {
          const from = path.join(staging, root);
          if (!(yield* files.exists(from)))
            return yield* ModelIntegrityFailure.make({
              operation: "publishArchive",
              legacyMessage: `${INCOMPLETE_MODEL_ERROR}: archive did not contain ${root}`,
            });
          yield* files.remove(path.join(modelsDir, root), true, true);
          yield* files.rename(from, path.join(modelsDir, root));
        }
        yield* files.write(marker, "ok");
      });
      const extractBody = Effect.fn("Models.extractBody")(function* (
        url: string,
        archive: string,
        marker: string,
        staging: string,
        tier: AsrTierId | undefined,
        signal: AbortSignal | undefined
      ) {
        yield* io.extract(archive, staging, signal);
        yield* checkAbort(signal, tier);
        if (hooks.afterArchiveStaged !== undefined) {
          yield* hooks.afterArchiveStaged(staging);
          yield* checkAbort(signal, tier);
        }
        const name = archiveName(url);
        if (Str.includes("whisper")(name)) {
          const directory = path.join(staging, Str.replace(/\.tar\.bz2$/i, "")(name));
          if (yield* files.exists(directory)) {
            for (const entry of yield* files.readDirectory(directory)) {
              if (Str.endsWith(".onnx")(entry) && !Str.includes(".int8.")(entry))
                yield* files.remove(path.join(directory, entry), false, true);
            }
          }
        }
        for (const spec of sharedSpecs(url)) {
          const state = yield* modelFiles.assess(spec, path.join(staging, spec.fileName));
          if (Boolean(state.issue) === true)
            return yield* ModelIntegrityFailure.make({ operation: "stagedArchive", legacyMessage: state.issue ?? "" });
          if (!state.present)
            return yield* ModelIntegrityFailure.make({
              operation: "stagedArchive",
              legacyMessage: `${INCOMPLETE_MODEL_ERROR}: missing ${spec.fileName}`,
            });
        }
        yield* lock(archive, publishArchiveBody(url, staging, marker));
      });
      const extract = Effect.fn("Models.extract")(function* (
        url: string,
        archive: string,
        marker: string,
        tier: AsrTierId | undefined,
        signal: AbortSignal | undefined
      ) {
        const staging = yield* modelFiles.stagingPath(archive);
        yield* files.mkdir(staging, true);
        yield* withModelCleanup(
          extractBody(url, archive, marker, staging, tier, signal),
          files.remove(staging, true, true)
        );
      });
      const remoteLength = Effect.fn("Models.remoteLength")(function* (url: string, signal: AbortSignal | undefined) {
        const response = yield* Effect.result(
          http.request({
            url,
            method: "HEAD",
            timeoutMs: options.attemptTimeoutMs ?? 15000,
            ...(signal === undefined ? {} : { signal }),
          })
        );
        if (Result.isFailure(response)) {
          yield* checkAbort(signal);
          if (cancelled(response.failure)) return yield* response.failure;
          return null;
        }
        const size =
          Boolean(response.success.contentLength) === true ? Number(response.success.contentLength) : Number.NaN;
        return Number.isFinite(size) && size > 0 ? size : null;
      });
      const extractionAbort = Effect.fn("Models.extractionAbort")(function* (
        error: TranscriptionError,
        signal: AbortSignal | undefined,
        tier: AsrTierId | undefined
      ) {
        yield* checkAbort(signal, tier);
        if (cancelled(error)) {
          if (error._tag === "HostFailure" && !(error.cause instanceof Error))
            return yield* ModelUnavailable.make({ operation: "archiveAbort", legacyMessage: error.legacyMessage });
          return yield* error;
        }
      });
      const archiveWork = Effect.fn("Models.archiveWork")(function* (
        spec: ModelFileSpec,
        signal: AbortSignal | undefined
      ) {
        yield* checkAbort(signal, spec.tier);
        const url = spec.url;
        const { archivePath, marker } = locations(url);
        yield* files.mkdir(path.dirname(archivePath), true);
        if (yield* lock(archivePath, prepareArchiveBody(url, archivePath, marker))) return;
        const expected = yield* remoteLength(url, signal);
        const exists = yield* files.exists(archivePath);
        const size = exists ? (yield* files.stat(archivePath)).size : 0;
        const reusable = exists && size > 0 && (expected === null || size >= expected);
        if (reusable) {
          const result = yield* Effect.result(extract(url, archivePath, marker, spec.tier, signal));
          if (Result.isSuccess(result)) return;
          yield* extractionAbort(result.failure, signal, spec.tier);
          yield* lock(archivePath, discardArchiveBody(url, archivePath, marker));
          if (yield* outputReady(url)) return;
        } else {
          yield* lock(archivePath, discardArchiveBody(url, archivePath, marker));
          if (yield* outputReady(url)) return;
        }
        yield* download(url, archivePath, undefined, spec.tier, signal);
        const result = yield* Effect.result(extract(url, archivePath, marker, spec.tier, signal));
        if (Result.isFailure(result)) {
          yield* extractionAbort(result.failure, signal, spec.tier);
          yield* lock(archivePath, discardArchiveBody(url, archivePath, marker));
          if (yield* outputReady(url)) return;
          if (Str.startsWith(INCOMPLETE_MODEL_ERROR)(result.failure.legacyMessage)) return yield* result.failure;
          return yield* ModelIntegrityFailure.make({
            operation: "extractArchive",
            legacyMessage: `${INCOMPLETE_MODEL_ERROR}: extraction failed for ${archiveName(url)}`,
          });
        }
      });
      const installArchive = Effect.fn("Models.installArchive")(function* (
        spec: ModelFileSpec,
        signal: AbortSignal | undefined
      ) {
        const key = `archive:${archiveName(spec.url)}`;
        const existing = get(inflight, key);
        if (existing !== undefined) {
          yield* Deferred.await(existing);
          yield* checkAbort(signal, spec.tier);
          return;
        }
        yield* shared(key, archiveWork(spec, signal));
      });
      const installDirectory = Effect.fn("Models.installDirectory")(function* (
        spec: ModelFileSpec,
        url: string,
        signal: AbortSignal | undefined
      ) {
        const destination = pathFor(spec);
        if ((yield* files.exists(destination)) && !(yield* files.stat(destination)).isDirectory)
          yield* files.remove(destination, false, true);
        yield* files.mkdir(destination, true);
        for (const member of spec.directoryMembers ?? []) {
          yield* checkAbort(signal, spec.tier);
          if ((yield* modelFiles.assessDirectory(destination, [member], false)).present) continue;
          const name = path.join(destination, member.name);
          yield* files.remove(name, true, true);
          yield* download(`${url}/${member.name}`, name, member.sha256, spec.tier, signal);
        }
      });
      const attempt = Effect.fn("Models.attempt")(function* (
        spec: ModelFileSpec,
        url: string,
        sha256: string | undefined,
        signal: AbortSignal | undefined
      ) {
        if (archiveUrl(url)) yield* installArchive({ ...spec, url }, signal);
        else if (spec.directoryMembers !== undefined && spec.directoryMembers.length > 0)
          yield* installDirectory(spec, url, signal);
        else yield* download(url, pathFor(spec), sha256, spec.tier, signal);
      });
      const install = Effect.fn("Models.install")(function* (spec: ModelFileSpec, signal: AbortSignal | undefined) {
        yield* checkAbort(signal, spec.tier);
        const sha256 = yield* awaitInternal("models.installSpec.checksumFor", checksumFor(spec));
        let urls: readonly string[];
        if (hooks.resolveUrls !== undefined) urls = yield* hooks.resolveUrls(spec);
        else {
          const preferChina = yield* hooks.preferChina;
          urls = modelDownloadUrls(Boolean(preferChina))(spec);
        }

        let last: TranscriptionError = ModelUnavailable.make({
          operation: "install",
          legacyMessage: `no download URLs for ${spec.id}`,
        });
        for (const url of urls) {
          yield* checkAbort(signal, spec.tier);
          if ((yield* assess(spec)).present) return;
          const result = yield* Effect.result(
            awaitInternal("models.installSpec.attempt", attempt(spec, url, sha256, signal))
          );
          if (Result.isFailure(result)) {
            yield* checkAbort(signal, spec.tier);
            if (cancelled(result.failure)) return yield* result.failure;
            if ((yield* assess(spec)).present) return;
            last = result.failure;
          } else {
            const state = yield* assess(spec);
            if (state.present) return;
            last = ModelUnavailable.make({
              operation: "install",
              legacyMessage: state.issue ?? `download of ${url} did not produce ${spec.fileName}`,
            });
          }
        }
        const state = yield* assess(spec);
        if (state.present) return;
        if (
          Str.startsWith(INCOMPLETE_MODEL_ERROR)(last.legacyMessage) &&
          (last._tag !== "HostFailure" || last.cause instanceof Error)
        )
          return yield* last;
        if (Boolean(state.issue) === true)
          return yield* ModelIntegrityFailure.make({ operation: "install", legacyMessage: state.issue ?? "" });
        if (last._tag === "HostFailure" && !(last.cause instanceof Error))
          return yield* ModelUnavailable.make({ operation: "install", legacyMessage: String(last.cause) });
        return yield* last;
      });
      const downloadMissing = Effect.fn("Models.downloadMissing")(function* (
        groups: readonly ModelGroup[] | undefined,
        tiers: readonly AsrTierId[] | undefined,
        signal: AbortSignal
      ) {
        yield* files.mkdir(modelsDir, true);
        for (const spec of wanted(groups, tiers)) {
          yield* checkAbort(signal, spec.tier ?? tiers?.[0]);
          if ((yield* assess(spec)).present) continue;
          yield* awaitInternal(
            "models.downloadMissing.installSpec",
            install(spec, Boolean(spec.tier) === true ? signal : undefined)
          );
        }
      });
      const begin = (tiers: readonly AsrTierId[] | undefined): void => {
        for (const tier of tiers ?? []) counts = HashMap.set(counts, tier, (get(counts, tier) ?? 0) + 1);
      };
      const end = (tiers: readonly AsrTierId[] | undefined): void => {
        for (const tier of tiers ?? []) {
          const next = (get(counts, tier) ?? 1) - 1;
          counts = next <= 0 ? HashMap.remove(counts, tier) : HashMap.set(counts, tier, next);
        }
      };
      const cancelCleanup = Effect.fn("Models.cancelCleanup")(function* (
        error: TranscriptionError,
        signal: AbortSignal,
        tiers: readonly AsrTierId[] | undefined
      ) {
        if (signal.aborted || cancelled(error)) {
          for (const tier of tiers ?? []) {
            if (Arr.some(wanted(["asr"], [tier]), (spec) => archiveUrl(spec.url))) continue;
            yield* purge(tier);
          }
          yield* checkAbort(signal, tiers?.[0]);
        }
        return yield* error;
      });
      const ensureReady = Effect.fn("Models.ensureReady")(function* (
        opts?: EnsureReadyOptions
      ): Effect.fn.Return<ModelStatus, TranscriptionError> {
        if (Boolean(opts?.tiers) === true && opts?.tiers !== undefined) activeTiers = opts.tiers;
        const current = yield* status(opts?.groups, opts?.tiers);
        if (current.ready) return current;
        const key = `${Arr.join(opts?.groups ?? ["vad", "speaker", "asr"], ",")}:${Arr.join(opts?.tiers ?? [], ",")}`;
        const existing = get(inflight, key);
        if (existing !== undefined) {
          yield* awaitInternal("models.ensureReady.shared", Deferred.await(existing));
          return yield* status(opts?.groups, opts?.tiers);
        }
        begin(opts?.tiers);
        const controller = hooks.makeAbortController();
        for (const tier of opts?.tiers ?? []) controllers = HashMap.set(controllers, tier, controller);
        const work = awaitInternal(
          "models.ensureReady.downloadMissing",
          downloadMissing(opts?.groups, opts?.tiers, controller.signal)
        ).pipe(Effect.catch((error) => cancelCleanup(error, controller.signal, opts?.tiers)));
        const cleanup = Effect.sync(() => {
          end(opts?.tiers);
          for (const tier of opts?.tiers ?? []) {
            if (get(controllers, tier) === controller) controllers = HashMap.remove(controllers, tier);
          }
        });
        yield* awaitInternal("models.ensureReady.pending", shared(key, withModelCleanup(work, cleanup)));
        const next = yield* status(opts?.groups, opts?.tiers);
        yield* emitProgress(true);
        if (!next.ready) {
          yield* checkAbort(controller.signal, opts?.tiers?.[0]);
          for (const tier of opts?.tiers ?? []) {
            const issue = yield* incomplete(tier);
            if (Boolean(issue) === true)
              return yield* ModelUnavailable.make({ operation: "ensureReady", legacyMessage: issue ?? "" });
          }
          return yield* ModelUnavailable.make({
            operation: "ensureReady",
            legacyMessage: "model not ready after download",
          });
        }
        return next;
      });
      const redownload = Effect.fn("Models.redownload")(function* () {
        for (const spec of catalog) {
          const name = pathFor(spec);
          if (yield* files.exists(name)) yield* files.remove(name, true, true);
        }
        const downloads = path.join(modelsDir, ".downloads");
        if (yield* files.exists(downloads)) yield* files.remove(downloads, true, true);
        return yield* ensureReady();
      });
      return Models.of({
        modelsDir,
        status,
        pathFor: Effect.fn("Models.pathFor")((spec) => Effect.succeed(pathFor(spec))),
        pathById: Effect.fn("Models.pathById")(function* (id) {
          const spec = Option.getOrUndefined(Arr.findFirst(catalog, (item) => item.id === id));
          return spec !== undefined && (yield* assess(spec)).present ? pathFor(spec) : null;
        }),
        pathByRole: Effect.fn("Models.pathByRole")(function* (role: ModelRole, tier) {
          const wantedTier = tier ?? activeTiers[0];
          const spec = Option.getOrUndefined(
            Arr.findFirst(
              catalog,
              (item) => item.role === role && !(Boolean(item.tier) && Boolean(wantedTier) && item.tier !== wantedTier)
            )
          );
          return spec !== undefined && (yield* assess(spec)).present ? pathFor(spec) : null;
        }),
        incompleteModelIssue: incomplete,
        ensureReady,
        ensureReadyAllowCancel: Effect.fn("Models.ensureReadyAllowCancel")((opts) =>
          awaitInternal("models.ensureReadyAllowCancel.ensureReady", ensureReady(opts)).pipe(
            Effect.catchIf(cancelled, () => status(opts?.groups, opts?.tiers))
          )
        ),
        redownload: redownload(),
        removeTier: Effect.fn("Models.removeTier")(function* (tier) {
          if ((get(counts, tier) ?? 0) > 0)
            return yield* ModelBusy.make({
              operation: "removeTier",
              legacyMessage: `cannot delete ${tier} while it is downloading`,
            });
          if (wanted(["asr"], [tier]).length === 0)
            return yield* ModelUnavailable.make({
              operation: "removeTier",
              legacyMessage: `unknown ASR tier: ${tier}`,
            });
          yield* purge(tier);
          return yield* status();
        }),
        cancelDownload: Effect.fn("Models.cancelDownload")(function* (tier) {
          const controller = get(controllers, tier);
          if (controller !== undefined && !controller.signal.aborted) controller.abort();
          yield* emitProgress(true);
          return yield* status();
        }),
        subscribe: Effect.fn("Models.subscribe")((sink) =>
          Effect.sync(() => {
            if (!Arr.some(listeners, (entry) => entry.active && entry.sink.emit === sink.emit))
              listeners.push({ sink, active: true });
            return Effect.sync(() => {
              for (const entry of listeners) {
                if (entry.active && entry.sink.emit === sink.emit) entry.active = false;
              }
              if (emitting === 0) listeners = Arr.filter(listeners, (entry) => entry.active);
            });
          })
        ),
      });
    })
  );
