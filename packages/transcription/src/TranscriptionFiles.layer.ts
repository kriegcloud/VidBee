import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";
import { HostFailure } from "./Transcription.errors.js";
import { TranscriptionFiles } from "./TranscriptionFiles.service.js";

const failure = (operation: string) => (cause: unknown) =>
  HostFailure.make({
    operation,
    cause,
    legacyMessage: cause instanceof Error ? cause.message : String(cause),
  });
export const TranscriptionFilesLive = Layer.effect(
  TranscriptionFiles,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return TranscriptionFiles.of({
      readBytes: Effect.fn("TranscriptionFiles.readBytes")((path) =>
        fs.readFile(path).pipe(Effect.mapError(failure("readBytes")))
      ),
      readText: Effect.fn("TranscriptionFiles.readText")((path) =>
        fs.readFile(path).pipe(
          Effect.mapBoth({
            onSuccess: (bytes) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
            onFailure: failure("readText"),
          })
        )
      ),
      stat: Effect.fn("TranscriptionFiles.stat")((path) =>
        fs.stat(path).pipe(
          Effect.mapBoth({
            onSuccess: (info) => ({
              size: Number(info.size),
              mtimeMs: Option.match(info.mtime, { onNone: () => 0, onSome: (date) => Number(date) }),
              isFile: info.type === "File",
              isDirectory: info.type === "Directory",
            }),
            onFailure: failure("stat"),
          })
        )
      ),
      readDirectory: Effect.fn("TranscriptionFiles.readDirectory")((path) =>
        fs.readDirectory(path).pipe(Effect.mapError(failure("readDirectory")))
      ),
      exists: Effect.fn("TranscriptionFiles.exists")((path) =>
        fs.access(path).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false)
        )
      ),
      write: Effect.fn("TranscriptionFiles.write")((path, data) =>
        (typeof data === "string" ? fs.writeFileString(path, data) : fs.writeFile(path, data)).pipe(
          Effect.mapError(failure("write"))
        )
      ),
      mkdir: Effect.fn("TranscriptionFiles.mkdir")((path, recursive) =>
        fs.makeDirectory(path, { recursive }).pipe(Effect.asVoid, Effect.mapError(failure("mkdir")))
      ),
      rename: Effect.fn("TranscriptionFiles.rename")((source, target) =>
        fs.rename(source, target).pipe(Effect.mapError(failure("rename")))
      ),
      remove: Effect.fn("TranscriptionFiles.remove")((path, recursive, force) =>
        fs.remove(path, { recursive, force }).pipe(Effect.mapError(failure("remove")))
      ),
      openRead: Effect.fn("TranscriptionFiles.openRead")(function* (path) {
        const scope = yield* Effect.acquireRelease(Scope.make(), (owner) => Scope.close(owner, Exit.void));
        const file = yield* fs
          .open(path, { flag: "r" })
          .pipe(Scope.provide(scope), Effect.mapError(failure("openRead")));
        return {
          readAt: Effect.fn("TranscriptionFiles.readAt")(
            (buffer: Uint8Array, offset: number, length: number, position: number) =>
              file
                .read(buffer.subarray(offset, offset + length), { position: BigInt(position) })
                .pipe(Effect.mapError(failure("readAt")))
          ),
          close: Scope.close(scope, Exit.void),
        };
      }),
    });
  })
);
