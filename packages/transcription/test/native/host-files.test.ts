import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { TranscriptionFilesLive } from "../../src/TranscriptionFiles.layer.js";
import { TranscriptionFiles } from "../../src/TranscriptionFiles.service.js";

const host = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
layer(TranscriptionFilesLive.pipe(Layer.provideMerge(host)))((it) => {
  it.effect(
    "reads BOM-preserving UTF-8 and returns false for all access failures",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const files = yield* TranscriptionFiles;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-transcription-files-" });
          const target = path.join(dir, "file");
          yield* files.write(target, new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0xff]));
          const text = yield* files.readText(target);
          expect(text).toBe("\uFEFFa\uFFFD");
          const missing = yield* files.exists(path.join(target, "child"));
          const invalid = yield* files.exists(`${target}\0invalid`);
          expect([missing, invalid]).toEqual([false, false]);
        })
      ),
    120000
  );
  it.effect(
    "positional reads retain cursor independence and closure is idempotent",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const files = yield* TranscriptionFiles;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-transcription-files-" });
          const target = path.join(dir, "file");
          yield* files.write(target, new Uint8Array([1, 2, 3, 4]));
          const file = yield* files.openRead(target);
          const output = new Uint8Array(4);
          const first = yield* file.readAt(output, 1, 2, 1);
          const second = yield* file.readAt(output, 0, 1, 0);
          expect([first, second, ...output]).toEqual([2, 1, 1, 2, 3, 0]);
          yield* file.close;
          yield* file.close;
          const closed = yield* file.readAt(output, 0, 1, 0).pipe(Effect.result);
          expect(Result.isFailure(closed)).toBe(true);
        })
      ),
    120000
  );
});
