import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { ModelFileIO, ModelFiles } from "./ModelFiles.service.js";
import { withModelCleanup } from "./ModelLifetime.js";
import { INCOMPLETE_MODEL_ERROR, QWEN3_TOKENIZER_REPAIR_HINT } from "./qwen3-tokenizer.js";
import { ModelBusy } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
import { TranscriptionIds } from "./TranscriptionIds.service.js";
import { TranscriptionTime } from "./TranscriptionTime.service.js";
import type { DirectoryAssessment, DirectoryMemberRequirement } from "./Model.model.js";
import type { HostFailure } from "./Transcription.errors.js";

// Intentionally shared between managers, including the historical cache-key omissions.
let assessments = HashMap.empty<string, { key: string; result: DirectoryAssessment }>();
const jsonUnknown = S.fromJsonString(S.Unknown);
const errorCode = (error: HostFailure): string | undefined => {
  const cause = error.cause;
  return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : undefined;
};
export const ModelFilesLive = Layer.effect(
  ModelFiles,
  Effect.gen(function* () {
    const files = yield* TranscriptionFiles;
    const host = yield* TranscriptionHost;
    const ids = yield* TranscriptionIds;
    const time = yield* TranscriptionTime;
    const io = yield* ModelFileIO;
    const path = yield* Path.Path;
    const statOrMissing = Effect.fn("ModelFiles.statOrMissing")(function* (name: string) {
      if (!(yield* files.exists(name))) return null;
      return yield* files.stat(name).pipe(Effect.orElseSucceed(() => null));
    });
    const presentBytes = Effect.fn("ModelFiles.presentBytes")(function* (name: string) {
      if (!(yield* files.exists(name))) return { present: false, bytes: 0 };
      const info = yield* files.stat(name);
      if (info.isDirectory) {
        const names = yield* files.readDirectory(name);
        return { present: names.length > 0, bytes: names.length };
      }
      return { present: info.size > 0, bytes: info.size };
    });
    const memberKey = Effect.fn("ModelFiles.memberKey")(function* (member: DirectoryMemberRequirement, name: string) {
      if (!(yield* files.exists(name))) return `${member.name}:missing`;
      const info = yield* files.stat(name);
      return `${member.name}:${info.size}:${info.mtimeMs}:${member.minBytes}:${member.sha256}`;
    });
    const assessDirectory = Effect.fn("ModelFiles.assessDirectory")(function* (
      dir: string,
      members: readonly DirectoryMemberRequirement[],
      withHint: boolean
    ) {
      const stats = yield* statOrMissing(dir);
      if (stats === null) return { present: false, bytes: 0, issue: null };
      const folder = path.basename(dir);
      const incomplete = (detail: string): string =>
        `${INCOMPLETE_MODEL_ERROR}: ${detail}${withHint ? `. ${QWEN3_TOKENIZER_REPAIR_HINT}` : ""}`;
      if (!stats.isDirectory) return { present: false, bytes: 0, issue: incomplete(`${folder} is not a directory`) };
      const parts: string[] = [];
      for (const member of members) {
        const name = path.join(dir, member.name);
        const item = yield* Effect.result(memberKey(member, name));
        parts.push(Result.isSuccess(item) ? item.success : `${member.name}:unreadable`);
      }
      const key = Arr.join(parts, "|");
      const cached = Option.getOrUndefined(HashMap.get(assessments, dir));
      if (cached?.key === key) return cached.result;
      const fail = (detail: string): DirectoryAssessment => {
        const result = { present: false, bytes: 0, issue: incomplete(detail) };
        assessments = HashMap.set(assessments, dir, { key, result });
        return result;
      };
      const present: Array<{ member: DirectoryMemberRequirement; name: string; label: string }> = [];
      for (const member of members) {
        const name = path.join(dir, member.name);
        const info = yield* statOrMissing(name);
        const label = `${folder}/${member.name}`;
        if (info === null || !info.isFile || info.size <= 0) return fail(`missing ${label}`);
        present.push({ member, name, label });
      }
      let bytes = 0;
      for (const { member, name, label } of present) {
        const body = yield* files.readBytes(name);
        const info = yield* files.stat(name);
        if (Boolean(member.json) === true) {
          const parsed = S.decodeResult(jsonUnknown)(new TextDecoder("utf-8", { ignoreBOM: true }).decode(body));
          if (
            Result.isFailure(parsed) ||
            parsed.success === null ||
            typeof parsed.success !== "object" ||
            Arr.isArray(parsed.success)
          )
            return fail(`${label} is truncated JSON`);
        }
        if (info.size < member.minBytes) return fail(`${label} is truncated`);
        const digest = yield* io.digest(body);
        if (digest !== member.sha256) return fail(`${label} checksum mismatch`);
        bytes += info.size;
      }
      const result = { present: true, bytes, issue: null };
      assessments = HashMap.set(assessments, dir, { key, result });
      return result;
    });
    const partPath = Effect.fn("ModelFiles.partPath")(function* (destination: string) {
      const snapshot = yield* host.snapshot;
      return `${destination}.part.${snapshot.pid}`;
    });
    const removePartFiles = Effect.fn("ModelFiles.removePartFiles")(function* (destination: string) {
      yield* files.remove(`${destination}.part`, false, true);
      const own = yield* partPath(destination);
      yield* files.remove(own, false, true);
    });
    const listStaging = Effect.fn("ModelFiles.listStaging")(function* (archive: string) {
      const directory = path.dirname(archive);
      if (!(yield* files.exists(directory))) return [];
      const names = yield* files.readDirectory(directory);
      return Arr.map(
        Arr.filter(names, (name) => Str.startsWith(`${path.basename(archive)}.staging.`)(name)),
        (name) => path.join(directory, name)
      );
    });
    const stagingAlive = Effect.fn("ModelFiles.stagingAlive")(function* (staging: string) {
      const match = /\.staging\.(\d+)\.[0-9a-f]+$/.exec(path.basename(staging));
      const pid = match?.[1] === undefined ? null : Number(match[1]);
      if (pid === null || !Number.isInteger(pid) || pid <= 0) return true;
      return yield* host.isProcessAlive(pid);
    });
    const readPid = Effect.fn("ModelFiles.readPid")(function* (directory: string) {
      const text = yield* files.readText(path.join(directory, "pid")).pipe(Effect.orElseSucceed(() => ""));
      const pid = Number(Str.trim(text));
      return Number.isInteger(pid) && pid > 0 ? pid : 0;
    });
    const age = Effect.fn("ModelFiles.age")(function* (directory: string) {
      const info = yield* files.stat(directory).pipe(Effect.orElseSucceed(() => null));
      return info === null ? Number.POSITIVE_INFINITY : (yield* time.now) - info.mtimeMs;
    });
    const lockPending = Effect.fn("ModelFiles.lockPending")(function* (directory: string) {
      const pid = yield* readPid(directory);
      return pid === 0 && (yield* age(directory)) < 2000;
    });
    const moveStale = Effect.fn("ModelFiles.moveStale")(function* (directory: string, pid: number, doomed: string) {
      const current = yield* readPid(directory);
      if (current !== pid || (yield* host.isProcessAlive(current)) || (current === 0 && (yield* age(directory)) < 2000))
        return false;
      yield* files.rename(directory, doomed);
      return true;
    });
    return ModelFiles.of({
      presentBytes,
      assessDirectory,
      partPath,
      removePartFiles,
      assess: Effect.fn("ModelFiles.assess")(function* (spec, name) {
        if (spec.directoryMembers !== undefined && spec.directoryMembers.length > 0)
          return yield* assessDirectory(name, spec.directoryMembers, spec.role === "asr-tokenizer");
        const info = yield* presentBytes(name);
        return { ...info, issue: null };
      }),
      publishFile: Effect.fn("ModelFiles.publishFile")(function* (temporary, destination) {
        const discard = Effect.fnUntraced(function* () {
          if (yield* files.exists(temporary)) yield* files.remove(temporary, false, true);
        });
        if ((yield* presentBytes(destination)).present) return yield* discard();
        const moved = yield* Effect.result(files.rename(temporary, destination));
        if (Result.isFailure(moved)) {
          if ((yield* presentBytes(destination)).present) return yield* discard();
          return yield* moved.failure;
        }
      }),
      stagingPath: Effect.fn("ModelFiles.stagingPath")(function* (archive) {
        const snapshot = yield* host.snapshot;
        const random = yield* ids.hex(6);
        return `${archive}.staging.${snapshot.pid}.${random}`;
      }),
      liveStaging: Effect.fn("ModelFiles.liveStaging")(function* (archive) {
        const alive: string[] = [];
        for (const name of yield* listStaging(archive)) {
          if (yield* stagingAlive(name)) alive.push(name);
        }
        return alive;
      }),
      removeStaleStaging: Effect.fn("ModelFiles.removeStaleStaging")(function* (archive) {
        for (const name of yield* listStaging(archive)) {
          if (!(yield* stagingAlive(name))) yield* files.remove(name, true, true);
        }
      }),
      acquireArchiveLock: Effect.fn("ModelFiles.acquireArchiveLock")(function* (directory) {
        const deadline = (yield* time.now) + 60000;
        yield* files.mkdir(path.dirname(directory), true);
        for (;;) {
          const made = yield* Effect.result(files.mkdir(directory, false));
          if (Result.isFailure(made)) {
            if (errorCode(made.failure) !== "EEXIST") return yield* made.failure;
            const pid = yield* readPid(directory);
            const pending = yield* lockPending(directory);
            if (pending || (yield* host.isProcessAlive(pid))) {
              if ((yield* time.now) > deadline)
                return yield* ModelBusy.make({
                  operation: "acquireArchiveLock",
                  legacyMessage: `timed out waiting for model archive lock ${path.basename(directory)}`,
                });
              yield* time.sleep(25);
              continue;
            }
            const snapshot = yield* host.snapshot;
            const random = yield* ids.hex(4);
            const doomed = `${directory}.stale.${snapshot.pid}.${random}`;
            const moved = yield* Effect.result(moveStale(directory, pid, doomed));
            if (Result.isFailure(moved) || !moved.success) continue;
            yield* files.remove(doomed, true, true);
            continue;
          }
          const snapshot = yield* host.snapshot;
          const written = yield* Effect.result(files.write(path.join(directory, "pid"), `${snapshot.pid}\n`));
          if (Result.isFailure(written)) {
            return yield* withModelCleanup(Effect.fail(written.failure), files.remove(directory, true, true));
          }
          return;
        }
      }),
      releaseArchiveLock: Effect.fn("ModelFiles.releaseArchiveLock")(function* (directory) {
        const pid = yield* readPid(directory);
        const snapshot = yield* host.snapshot;
        if (pid === snapshot.pid) yield* files.remove(directory, true, true);
      }),
    });
  })
);
