import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { dual } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { InfrastructureFailure } from "../Standards.errors.js";
import { CompilerCoverage, CoverageRun, RelativeFile } from "../Standards.model.js";
import { SourceInventory, Workspace } from "../Workspace.service.js";
import { CompilerExecution } from "./CompilerExecution.service.js";
import type * as Scope from "effect/Scope";
import type { InvalidInput } from "../Standards.errors.js";
import type { CheckScope, CompilerRun } from "../Standards.model.js";

const $I = $StandardsId.create("compiler/Coverage.service");
const SupplementalProject = S.Struct({
  extends: S.String,
  compilerOptions: S.Struct({
    allowJs: S.Boolean,
    checkJs: S.Boolean,
    noEmit: S.Boolean,
    composite: S.Boolean,
    incremental: S.Boolean,
    rootDir: S.String,
  }),
  files: S.Array(S.String),
  include: S.Array(S.String),
}).pipe(
  $I.annoteSchema("SupplementalProject", {
    description: "Supplemental strict analysis project; semantic compiler policy is inherited unchanged.",
  })
);
/** Every selected active executable must occur in an installed compiler execution.
 *
 * @category services
 * @since 0.0.0
 */
export class Coverage extends Context.Service<
  Coverage,
  {
    readonly verify: (
      scope: CheckScope
    ) => Effect.Effect<CoverageRun, InfrastructureFailure | InvalidInput, Scope.Scope>;
  }
>()($I`Coverage`) {}
/** Own supplemental projects under a caller-owned run directory; never write beside source.
 *
 * @category layers
 * @since 0.0.0
 */
export const coverageLayer: {
  (
    root: string,
    runDirectory: string
  ): Layer.Layer<Coverage, never, FileSystem.FileSystem | Path.Path | SourceInventory | Workspace | CompilerExecution>;
  (
    runDirectory: string
  ): (
    root: string
  ) => Layer.Layer<
    Coverage,
    never,
    FileSystem.FileSystem | Path.Path | SourceInventory | Workspace | CompilerExecution
  >;
} = dual(2, (root: string, runDirectory: string) =>
  Layer.effect(
    Coverage,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const inventory = yield* SourceInventory;
      const workspace = yield* Workspace;
      const compiler = yield* CompilerExecution;
      return {
        verify: Effect.fn("Coverage.verify")(function* (scope: CheckScope) {
          return yield* Effect.gen(function* () {
            const all = yield* inventory.collect(root);
            const packages = yield* workspace.discover(root);
            const active = A.filter(
              all,
              (entry) =>
                entry.executable &&
                (entry.classification === "active" || entry.classification === "compatibility-owner") &&
                A.contains(scope.files, entry.file)
            );
            let runs: ReadonlyArray<CompilerRun> = [];
            const selected = A.filter(packages, (pkg) => A.contains(scope.packages, pkg.name));
            for (const pkg of selected) {
              for (const project of pkg.projects) {
                const run = yield* compiler.compile(path.join(root, project));
                runs = A.append(runs, run);
              }
            }
            yield* fs.makeDirectory(runDirectory, { recursive: true });
            const temporary = yield* fs.makeTempDirectoryScoped({ directory: runDirectory, prefix: "coverage-" });
            const missing = A.filter(
              active,
              (entry) => !A.some(runs, (run) => A.contains(run.files, path.join(root, entry.file)))
            );
            for (const pkg of [...selected, { name: "vidbee-workspace", root: "", projects: [] }]) {
              const uncovered = A.filter(missing, (entry) => entry.package === pkg.name);
              if (uncovered.length === 0) continue;
              const projectName = `${Str.replace(/[^a-zA-Z0-9_-]/g, "_")(pkg.name)}.json`;
              const config = path.join(temporary, projectName);
              const parent = pkg.projects[0];
              const model = {
                extends: path.join(root, parent === undefined ? "tsconfig.base.json" : parent),
                compilerOptions: {
                  allowJs: true,
                  checkJs: true,
                  noEmit: true,
                  composite: false,
                  incremental: false,
                  rootDir: root,
                },
                files: A.map(uncovered, (entry) => path.join(root, entry.file)),
                include: [],
              };
              const encoded = yield* S.encodeEffect(S.fromJsonString(SupplementalProject))(model);
              yield* fs.writeFileString(config, encoded);
              const run = yield* compiler.compile(config);
              runs = A.append(runs, run);
            }
            const coverage = A.map(active, (entry) => {
              const projects = A.filter(runs, (run) => A.contains(run.files, path.join(root, entry.file)));
              return CompilerCoverage.make({
                file: entry.file,
                projects: A.map(projects, (run) => RelativeFile.make(path.relative(root, run.project))),
                completedStages: projects.length === 0 ? [] : ["tsrs"],
              });
            });
            if (A.some(coverage, (entry) => entry.projects.length === 0))
              return yield* InfrastructureFailure.make({
                message: "Active executable source remains uncovered by compiler execution.",
                cause: coverage,
              });
            return CoverageRun.make({ runs, coverage });
          }).pipe(
            Effect.mapError((error) =>
              error._tag === "InvalidInput" || error._tag === "InfrastructureFailure"
                ? error
                : InfrastructureFailure.make({ message: "Compiler coverage failed.", cause: error })
            )
          );
        }),
      };
    })
  )
);
