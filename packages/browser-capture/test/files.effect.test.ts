import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { CaptureFilesLive } from "../src/CaptureFiles.layer.js";
import { CaptureFiles } from "../src/CaptureFiles.service.js";

layer(CaptureFilesLive.pipe(Layer.provideMerge(NodeServices.layer)))("native capture files", (it) => {
  it.effect(
    "preserves BOM, bytes, creation-only permissions and separate copy/rename/remove behavior",
    () =>
      Effect.gen(function* () {
        const files = yield* CaptureFiles;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-capture-files-" });
        const source = path.join(root, "source");
        yield* files.write(source, "\ufefffixture", { mode: 0o600 });
        const original = yield* files.readText(source);
        expect(original).toBe("\ufefffixture");
        yield* fs.chmod(source, 0o640);
        yield* files.write(source, new Uint8Array([255, 0, 1]), { mode: 0o600 });
        const actual = yield* files.readBytes(source);
        expect([...actual]).toEqual([255, 0, 1]);
        const info = yield* fs.stat(source);
        expect(info.mode & 0o777).toBe(0o640);
        const copy = path.join(root, "copy");
        yield* files.copy(source, copy);
        const renamed = path.join(root, "renamed");
        yield* files.rename(copy, renamed);
        const names = yield* files.list(root);
        expect(names.sort()).toEqual(["renamed", "source"]);
        const size = yield* files.stat(renamed);
        expect(size).toEqual({ size: 3, isFile: true, isDirectory: false });
        yield* files.remove(renamed);
        const exists = yield* files.exists(renamed);
        expect(exists).toBe(false);
      }),
    60000
  );
});
