import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import { compilerExecutionLayer } from "../src/compiler/CompilerExecution.service.js";
import { CompilerHostLive } from "../src/compiler/CompilerHost.layer.js";
import { Coverage, coverageLayer } from "../src/compiler/Coverage.service.js";
import { CheckScope, InventoryFile, RelativeFile, WorkspaceManifest } from "../src/Standards.model.js";
import { SourceInventory, Workspace } from "../src/Workspace.service.js";
import { CoverageProbeReport } from "./Probe.model.js";

const $I = $StandardsId.create("test/CoverageProbe.entry");
class TestRoot extends Context.Service<
  TestRoot,
  { readonly root: string; readonly config: string; readonly scope: CheckScope }
>()($I`TestRoot`) {}
const Config = S.Struct({
  extends: S.String,
  compilerOptions: S.Struct({ rootDir: S.String, noEmit: S.Boolean, composite: S.Boolean, incremental: S.Boolean }),
  files: S.Array(S.String),
  include: S.Array(S.String),
});
const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const temporary = path.resolve(import.meta.dirname, "../.cache/coverage-fixtures");
    yield* fs.makeDirectory(temporary, { recursive: true });
    const root = yield* fs.makeTempDirectoryScoped({ directory: temporary, prefix: "root-" });
    const packageRoot = path.join(root, "packages/fixture");
    for (const dir of ["src", "build", "types"])
      yield* fs.makeDirectory(path.join(packageRoot, dir), { recursive: true });
    yield* fs.writeFileString(path.join(packageRoot, "package.json"), '{"name":"@vidbee/standards","type":"module"}');
    yield* fs.writeFileString(path.join(packageRoot, "src/Existing.ts"), "export const value = 1;\n");
    yield* fs.writeFileString(path.join(packageRoot, "build/extra.js"), "export const extra = 2;\n");
    yield* fs.writeFileString(
      path.join(packageRoot, "types/local.d.ts"),
      "export interface ExternalValue { readonly value: string; }\n"
    );
    const config = path.join(packageRoot, "tsconfig.json");
    const configText = yield* S.encodeEffect(S.fromJsonString(Config))({
      extends: path.resolve(import.meta.dirname, "../../../tsconfig.base.json"),
      compilerOptions: { rootDir: ".", noEmit: true, composite: false, incremental: false },
      files: [path.join(packageRoot, "src/Existing.ts")],
      include: [],
    });
    yield* fs.writeFileString(config, configText);
    const paths = [
      "packages/fixture/src/Existing.ts",
      "packages/fixture/build/extra.js",
      "packages/fixture/types/local.d.ts",
    ];
    const files = A.map(paths, (file) =>
      InventoryFile.make({
        file: RelativeFile.make(file),
        package: "@vidbee/standards",
        classification: "active",
        executable: true,
        reason: "Exact executable fixture membership.",
      })
    );
    const scope = CheckScope.make({
      packages: ["@vidbee/standards"],
      files: A.map(paths, (file) => RelativeFile.make(file)),
      full: true,
    });
    const inventory = Layer.succeed(SourceInventory, {
      collect: Effect.fn("Fixture.collect")((_root: string) => Effect.succeed(files)),
      select: Effect.fn("Fixture.select")((_packages: ReadonlyArray<string>, _files: ReadonlyArray<string>) =>
        Effect.succeed(scope)
      ),
    });
    const workspace = Layer.succeed(Workspace, {
      discover: Effect.fn("Fixture.discover")((_root: string) =>
        Effect.succeed([
          WorkspaceManifest.make({
            name: "@vidbee/standards",
            root: RelativeFile.make("packages/fixture"),
            projects: [RelativeFile.make("packages/fixture/tsconfig.json")],
            dependencies: [],
          }),
        ])
      ),
    });
    return coverageLayer(root, path.join(root, ".cache/coverage")).pipe(
      Layer.provide([inventory, workspace]),
      Layer.merge(Layer.succeed(TestRoot, { root, config, scope }))
    );
  })
);
const compiler = compilerExecutionLayer(`${import.meta.dirname}/../../../node_modules/.bin/tsrs`).pipe(
  Layer.provideMerge(CompilerHostLive)
);
const dependencies = fixture.pipe(Layer.provide(compiler), Layer.provideMerge(NodeServices.layer));
NodeRuntime.runMain(
  Effect.gen(function* () {
    const coverage = yield* Coverage;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { root, config, scope } = yield* TestRoot;
    const result = yield* Effect.scoped(coverage.verify(scope));
    const generated = A.filter(result.runs, (run) => run.project !== config);
    const removed = yield* Effect.forEach(generated, (run) => fs.exists(run.project), { concurrency: 1 });
    const text = yield* fs.readFileString(path.join(root, "packages/fixture/build/extra.js"));
    const report = CoverageProbeReport.make({
      complete: result.coverage.length === 3 && A.every(result.coverage, (entry) => entry.completedStages.length > 0),
      javascript: A.some(result.coverage, (entry) => entry.file === "packages/fixture/build/extra.js"),
      declaration: A.some(result.coverage, (entry) => entry.file === "packages/fixture/types/local.d.ts"),
      passed: A.every(result.runs, (run) => run.exitCode === 0),
      supplemental: generated.length === 1,
      cleaned: A.every(removed, (exists) => !exists),
      unchanged: text === "export const extra = 2;\n",
    });
    const encoded = yield* S.encodeEffect(S.fromJsonString(CoverageProbeReport))(report);
    yield* Console.log(encoded);
  }).pipe(Effect.provide(dependencies))
);
