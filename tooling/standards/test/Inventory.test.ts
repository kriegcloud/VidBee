import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { InventoryFile, RelativeFile } from "../src/Standards.model.js";
import { sourceInventoryLayer, WorkspaceLive } from "../src/Workspace.layer.js";
import { SourceInventory } from "../src/Workspace.service.js";

const $I = $StandardsId.create("test/Inventory.test");
class TestTree extends Context.Service<TestTree, { readonly root: string }>()($I`TestTree`) {}
const Scope = S.Struct({ version: S.Literal(1), files: S.Array(InventoryFile) }).pipe(
  $StandardsId.create("test/Inventory.test").annoteSchema("Scope", { description: "Validated Scope fixture data." })
);
const treeLayer = Layer.effect(
  TestTree,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const directory = path.resolve(import.meta.dirname, "../.cache/inventory-fixtures");
    yield* fs.makeDirectory(directory, { recursive: true });
    const root = yield* fs.makeTempDirectoryScoped({ directory, prefix: "tree-" });
    for (const dir of ["standards", "packages/a/src", "packages/b/src"])
      yield* fs.makeDirectory(path.join(root, dir), { recursive: true });
    yield* fs.writeFileString(
      path.join(root, "package.json"),
      '{"name":"vidbee-workspace","workspaces":["packages/*"]}'
    );
    yield* fs.writeFileString(path.join(root, "packages/a/package.json"), '{"name":"@vidbee/a"}');
    yield* fs.writeFileString(path.join(root, "packages/b/package.json"), '{"name":"@vidbee/b"}');
    yield* fs.writeFileString(path.join(root, "packages/a/src/index.ts"), "export const a = 1;");
    yield* fs.writeFileString(path.join(root, "packages/b/src/index.ts"), "export const b = 2;");
    const files = A.map(
      [
        "package.json",
        "standards/scope.json",
        "packages/a/package.json",
        "packages/b/package.json",
        "packages/a/src/index.ts",
        "packages/b/src/index.ts",
      ],
      (file) =>
        InventoryFile.make({
          file: RelativeFile.make(file),
          package:
            file === "packages/a/package.json" || file === "packages/a/src/index.ts"
              ? "@vidbee/a"
              : file === "packages/b/package.json" || file === "packages/b/src/index.ts"
                ? "@vidbee/b"
                : "vidbee-workspace",
          classification: Str.endsWith(".ts")(file) ? "active" : "data",
          reason: "Fixture ownership.",
          executable: Str.endsWith(".ts")(file),
        })
    );
    const json = yield* S.encodeEffect(S.fromJsonString(Scope))({ version: 1, files });
    yield* fs.writeFileString(path.join(root, "standards/scope.json"), json);
    const code = yield* spawner.exitCode(ChildProcess.make("git", ["init", "-q"], { cwd: root }));
    expect(code).toBe(0);
    return { root };
  })
);
const inventoryLayer = Layer.unwrap(Effect.map(TestTree, ({ root }) => sourceInventoryLayer(root))).pipe(
  Layer.provide(WorkspaceLive),
  Layer.provideMerge(treeLayer),
  Layer.provideMerge(NodeServices.layer)
);
it.layer(inventoryLayer)("inventory and scope", (it) => {
  it.effect("expands one file to its complete package and global changes to full scope", () =>
    Effect.gen(function* () {
      const inventory = yield* SourceInventory;
      const bounded = yield* inventory.select([], ["packages/a/src/index.ts"]);
      expect(bounded.packages).toEqual(["@vidbee/a"]);
      expect(bounded.files).toContain("packages/a/package.json");
      expect(bounded.full).toBe(false);
      const full = yield* inventory.select([], ["package.json"]);
      expect(full.full).toBe(true);
      expect(full.packages.length).toBe(2);
    })
  );
  it.effect("rejects unknown packages and files", () =>
    Effect.gen(function* () {
      const inventory = yield* SourceInventory;
      const unknownPackage = yield* Effect.result(inventory.select(["missing"], []));
      const unknownFile = yield* Effect.result(inventory.select([], ["unknown.ts"]));
      expect(unknownPackage._tag).toBe("Failure");
      expect(unknownFile._tag).toBe("Failure");
    })
  );
  it.effect("inventories untracked source and rejects new unclassified membership", () =>
    Effect.gen(function* () {
      const inventory = yield* SourceInventory;
      const { root } = yield* TestTree;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const observed = yield* inventory.collect(root);
      expect(observed.length).toBe(6);
      const added = path.join(root, "packages/a/src/new.ts");
      yield* fs.writeFileString(added, "export const added = 1;");
      const result = yield* inventory
        .collect(root)
        .pipe(Effect.result, Effect.ensuring(fs.remove(added).pipe(Effect.orDie)));
      expect(result._tag).toBe("Failure");
    })
  );
});
describe("closed inventory paths", () => {
  it.effect("rejects traversal and unknown fields at decoding", () =>
    Effect.gen(function* () {
      const invalid = yield* S.decodeUnknownEffect(InventoryFile, { onExcessProperty: "error" })({
        file: "../escape",
        package: "@vidbee/a",
        classification: "active",
        reason: "Invalid.",
        executable: true,
        hidden: true,
      }).pipe(Effect.result);
      expect(invalid._tag).toBe("Failure");
    })
  );
});
