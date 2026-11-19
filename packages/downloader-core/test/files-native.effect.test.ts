import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { DownloadFilesLive } from "../src/DownloadFiles.layer.js";
import { DownloadFiles } from "../src/DownloadFiles.service.js";
import { writeKnownItemsFile } from "../src/social-media-service.js";

const host = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const live = DownloadFilesLive.pipe(Layer.provideMerge(host));

layer(live)((it) => {
  it.effect("preserves BOM bytes and replaces invalid UTF-8 in file reads", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const files = yield* DownloadFiles;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-files-" });
        const target = path.join(directory, "inventory.json");
        yield* fs.writeFile(target, new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]));
        const bom = yield* files.read(target);
        expect(bom).toBe("\uFEFF{}");
        yield* fs.writeFile(target, new Uint8Array([0x61, 0xff, 0xc3, 0x28, 0x62]));
        const invalid = yield* files.read(target);
        expect(invalid).toBe("a\uFFFD\uFFFD(b");
      })
    )
  );

  it.effect("returns false for missing paths and failed access probes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const files = yield* DownloadFiles;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-files-" });
        const regular = path.join(directory, "regular");
        yield* files.write(regular, "content");
        const present = yield* files.exists(regular);
        const missing = yield* files.exists(path.join(directory, "absent"));
        const invalidParent = yield* files.exists(path.join(regular, "child"));
        const invalidName = yield* files.exists(`${regular}\0invalid`);
        expect([present, missing, invalidParent, invalidName]).toEqual([true, false, false, false]);
      })
    )
  );

  it.effect("applies creation modes and preserves modes of existing files and directories", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const files = yield* DownloadFiles;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-files-" });
        const target = path.join(directory, "inventory.json");
        const nested = path.join(directory, "inventory");
        yield* files.write(target, "first", 0o600);
        yield* files.makeDirectory(nested, true, 0o700);
        const createdFile = yield* fs.stat(target);
        const createdDirectory = yield* fs.stat(nested);
        expect(createdFile.mode & 0o777).toBe(0o600);
        expect(createdDirectory.mode & 0o777).toBe(0o700);
        yield* files.chmod(target, 0o640);
        yield* files.chmod(nested, 0o750);
        yield* files.write(target, "second", 0o600);
        yield* files.makeDirectory(nested, true, 0o700);
        const existingFile = yield* fs.stat(target);
        const existingDirectory = yield* fs.stat(nested);
        expect(existingFile.mode & 0o777).toBe(0o640);
        expect(existingDirectory.mode & 0o777).toBe(0o750);
      })
    )
  );

  it.effect("retains a temporary inventory when rename fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const files = yield* DownloadFiles;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-files-" });
        const temporary = path.join(directory, "inventory.json.tmp");
        const destination = path.join(directory, "unreplaced-directory");
        yield* files.makeDirectory(destination, true);
        yield* files.write(path.join(destination, "keep"), "retained");
        yield* files.write(temporary, "next", 0o600);
        const renamed = yield* files.rename(temporary, destination).pipe(Effect.result);
        expect(Result.isFailure(renamed)).toBe(true);
        if (Result.isFailure(renamed)) {
          expect(renamed.failure._tag).toBe("HostFailure");
          expect(renamed.failure.operation).toBe("rename");
        }
        const residue = yield* files.read(temporary);
        const retained = yield* files.read(path.join(destination, "keep"));
        expect(residue).toBe("next");
        expect(retained).toBe("retained");
      })
    )
  );

  it.effect("writes known items directly and preserves the overwritten inode and mode", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const files = yield* DownloadFiles;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-files-" });
        const target = path.join(directory, "known-items.json");
        yield* files.write(target, "old", 0o600);
        yield* files.chmod(target, 0o640);
        const before = yield* fs.stat(target);
        const written = yield* writeKnownItemsFile(directory, ["second", "first", "second"]);
        const after = yield* fs.stat(target);
        const text = yield* files.read(target);
        const names = yield* files.readDirectory(directory);
        expect(written).toBe(target);
        expect(text).toBe('["second","first","second"]');
        expect(names).toEqual(["known-items.json"]);
        expect(after.ino).toEqual(before.ino);
        expect(after.mode & 0o777).toBe(0o640);
      })
    )
  );
});
