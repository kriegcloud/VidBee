import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { HostFailure } from "./Downloader.errors.js";
import { DownloadFiles } from "./DownloadFiles.service.js";

const failure = (operation: string) => (cause: unknown) =>
  HostFailure.make({
    operation,
    cause,
    legacyMessage: cause instanceof Error ? cause.message : String(cause),
  });

/** Native files preserve BOMs and treat every unsuccessful access probe as absent. */
export const DownloadFilesLive = Layer.effect(
  DownloadFiles,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return DownloadFiles.of({
      read: Effect.fn("DownloadFiles.read")((file) =>
        fs.readFile(file).pipe(
          Effect.mapBoth({
            onSuccess: (bytes) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
            onFailure: failure("read"),
          })
        )
      ),
      exists: Effect.fn("DownloadFiles.exists")((file) =>
        fs.access(file).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false)
        )
      ),
      stat: Effect.fn("DownloadFiles.stat")((file) =>
        fs.stat(file).pipe(
          Effect.mapBoth({
            onSuccess: (info) => ({ size: Number(info.size), isFile: info.type === "File" }),
            onFailure: failure("stat"),
          })
        )
      ),
      write: Effect.fn("DownloadFiles.write")((file, text, mode) =>
        fs.writeFileString(file, text, { flag: "w", mode }).pipe(Effect.mapError(failure("write")))
      ),
      makeDirectory: Effect.fn("DownloadFiles.makeDirectory")((directory, recursive, mode) =>
        fs.makeDirectory(directory, { recursive, mode }).pipe(Effect.mapError(failure("makeDirectory")))
      ),
      makeTempDirectory: Effect.fn("DownloadFiles.makeTempDirectory")((prefix) =>
        fs
          .makeTempDirectory({ directory: path.dirname(prefix), prefix: path.basename(prefix) })
          .pipe(Effect.mapError(failure("makeTempDirectory")))
      ),
      rename: Effect.fn("DownloadFiles.rename")((source, target) =>
        fs.rename(source, target).pipe(Effect.mapError(failure("rename")))
      ),
      readDirectory: Effect.fn("DownloadFiles.readDirectory")((directory) =>
        fs.readDirectory(directory).pipe(Effect.mapError(failure("readDirectory")))
      ),
      remove: Effect.fn("DownloadFiles.remove")((file, recursive) =>
        fs.remove(file, { recursive, force: true }).pipe(Effect.mapError(failure("remove")))
      ),
      chmod: Effect.fn("DownloadFiles.chmod")((file, mode) =>
        fs.chmod(file, mode).pipe(Effect.mapError(failure("chmod")))
      ),
    });
  })
);
