import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { HostFailure } from "./Capture.errors.js";
import { CaptureFiles } from "./CaptureFiles.service.js";

const failure = (operation: string) => (cause: unknown) =>
  HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) });
export const CaptureFilesLive = Layer.effect(
  CaptureFiles,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return CaptureFiles.of({
      readText: Effect.fn("CaptureFiles.readText")((file) =>
        fs.readFile(file).pipe(
          Effect.mapBoth({
            onSuccess: (bytes) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
            onFailure: failure("readText"),
          })
        )
      ),
      readBytes: Effect.fn("CaptureFiles.readBytes")((file) =>
        fs.readFile(file).pipe(Effect.mapError(failure("readBytes")))
      ),
      exists: Effect.fn("CaptureFiles.exists")((file) => fs.exists(file).pipe(Effect.mapError(failure("exists")))),
      stat: Effect.fn("CaptureFiles.stat")((file) =>
        fs.stat(file).pipe(
          Effect.mapBoth({
            onSuccess: (info) => ({
              size: Number(info.size),
              isFile: info.type === "File",
              isDirectory: info.type === "Directory",
            }),
            onFailure: failure("stat"),
          })
        )
      ),
      list: Effect.fn("CaptureFiles.list")((file) => fs.readDirectory(file).pipe(Effect.mapError(failure("list")))),
      mkdir: Effect.fn("CaptureFiles.mkdir")((file, options) =>
        fs.makeDirectory(file, options).pipe(Effect.mapError(failure("mkdir")))
      ),
      tempDirectory: Effect.fn("CaptureFiles.tempDirectory")((prefix) =>
        fs
          .makeTempDirectory({ directory: path.dirname(prefix), prefix: path.basename(prefix) })
          .pipe(Effect.mapError(failure("tempDirectory")))
      ),
      copy: Effect.fn("CaptureFiles.copy")((source, target) =>
        fs.copyFile(source, target).pipe(Effect.mapError(failure("copy")))
      ),
      write: Effect.fn("CaptureFiles.write")((file, data, options) =>
        (typeof data === "string"
          ? fs.writeFileString(file, data, { flag: "w", mode: options?.mode })
          : fs.writeFile(file, data, { flag: "w", mode: options?.mode })
        ).pipe(Effect.mapError(failure("write")))
      ),
      rename: Effect.fn("CaptureFiles.rename")((source, target) =>
        fs.rename(source, target).pipe(Effect.mapError(failure("rename")))
      ),
      remove: Effect.fn("CaptureFiles.remove")((file, options) =>
        fs.remove(file, options).pipe(Effect.mapError(failure("remove")))
      ),
    });
  })
);
