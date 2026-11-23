import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as R from "effect/Record";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { InfrastructureFailure, InvalidInput } from "./Standards.errors.js";
import { CheckScope, InventoryFile, RelativeFile, WorkspaceManifest } from "./Standards.model.js";
import { SourceInventory, Workspace } from "./Workspace.service.js";

const $I = $StandardsId.create("Workspace.layer");
const RootInput = S.Struct({ workspaces: S.Array(S.NonEmptyString.check(S.isPattern(/^[A-Za-z0-9_-]+\/\*$/))) }).pipe(
  $I.annoteSchema("RootInput", { description: "Explicit one-level workspace patterns from the root manifest." })
);
const PackageInput = S.Struct({
  name: S.NonEmptyString,
  dependencies: S.optionalKey(S.Record(S.String, S.String)),
  devDependencies: S.optionalKey(S.Record(S.String, S.String)),
}).pipe($I.annoteSchema("PackageInput", { description: "Consumed workspace manifest fields." }));
const ScopeInput = S.Struct({ version: S.Literal(1), files: S.Array(InventoryFile) }).pipe(
  $I.annoteSchema("ScopeInput", { description: "Exact protected inventory membership." })
);
const invalid = () => InvalidInput.make({ message: "Workspace or scope JSON failed decoding." });
const infra = (cause: unknown) =>
  InfrastructureFailure.make({ message: "Workspace inventory operation failed.", cause });
/**
 * WorkspaceLive supplies the owned WorkspaceLive infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide WorkspaceLive at a Node entrypoint)
 *
 * ```ts
 * import { Workspace, WorkspaceLive } from "@vidbee/standards"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * NodeRuntime.runMain(
 *   Workspace.use((workspace) => workspace.discover(".")).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(WorkspaceLive.pipe(Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const WorkspaceLive = Layer.effect(
  Workspace,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return {
      discover: Effect.fn("Workspace.discover")(
        function* (root: string) {
          const rootRaw = yield* fs.readFileString(path.join(root, "package.json"));
          const rootManifest = yield* S.decodeEffect(S.fromJsonString(RootInput))(rootRaw).pipe(
            Effect.mapError(invalid)
          );
          const directories = A.map(rootManifest.workspaces, Str.replace(/\/\*$/, ""));
          const found = yield* Effect.forEach(
            directories,
            (directory) =>
              Effect.gen(function* () {
                const exists = yield* fs.exists(path.join(root, directory));
                if (!exists) return [];
                const children = yield* fs.readDirectory(path.join(root, directory));
                return yield* Effect.forEach(
                  children,
                  (child) =>
                    Effect.gen(function* () {
                      const manifestPath = path.join(root, directory, child, "package.json");
                      if (!(yield* fs.exists(manifestPath))) return [];
                      const raw = yield* fs.readFileString(manifestPath);
                      const manifest = yield* S.decodeEffect(S.fromJsonString(PackageInput))(raw).pipe(
                        Effect.mapError(invalid)
                      );
                      const contents = yield* fs.readDirectory(path.join(root, directory, child));
                      const projects = A.map(
                        A.filter(contents, (name) => /^tsconfig(?:\.[^/]*)?\.json$/.test(name)),
                        (name) => `${directory}/${child}/${name}`
                      );
                      return [
                        WorkspaceManifest.make({
                          name: manifest.name,
                          root: RelativeFile.make(`${directory}/${child}`),
                          projects: A.map(projects, (file) => RelativeFile.make(file)),
                          dependencies: [
                            ...(manifest.dependencies === undefined ? [] : R.keys(manifest.dependencies)),
                            ...(manifest.devDependencies === undefined ? [] : R.keys(manifest.devDependencies)),
                          ],
                        }),
                      ];
                    }),
                  { concurrency: 1 }
                ).pipe(Effect.map(A.flatten));
              }),
            { concurrency: 1 }
          );
          const flattened = A.flatten(found);
          if (HashSet.size(HashSet.fromIterable(A.map(flattened, (entry) => entry.name))) !== flattened.length)
            return yield* InvalidInput.make({ message: "Duplicate workspace manifest name." });
          return flattened;
        },
        Effect.mapError((error) => (error._tag === "InvalidInput" ? error : infra(error)))
      ),
    };
  })
);

/** Bind inventory to a source tree; callers inject platform services and workspace discovery.
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide sourceInventoryLayer at a Node entrypoint)
 *
 * ```ts
 * import { WorkspaceLive, SourceInventory, sourceInventoryLayer } from "@vidbee/standards"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * import * as Layer from "effect/Layer"
 * NodeRuntime.runMain(
 *   SourceInventory.use((inventory) => inventory.select(["@vidbee/schema"], [])).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(sourceInventoryLayer(".").pipe(Layer.provide(WorkspaceLive), Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const sourceInventoryLayer = (root: string) =>
  Layer.effect(
    SourceInventory,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const workspace = yield* Workspace;
      const packages = yield* workspace.discover(root);
      const raw = yield* fs.readFileString(path.join(root, "standards/scope.json")).pipe(Effect.mapError(infra));
      const scope = yield* S.decodeEffect(S.fromJsonString(ScopeInput), { onExcessProperty: "error" })(raw).pipe(
        Effect.mapError(invalid)
      );
      const known = HashSet.fromIterable(A.map(scope.files, (entry) => entry.file));
      if (HashSet.size(known) !== scope.files.length)
        return yield* InvalidInput.make({ message: "Duplicate scope file." });

      for (const entry of scope.files) {
        if (entry.package === "vidbee-workspace") {
          if (A.some(packages, (pkg) => Str.startsWith(`${pkg.root}/`)(entry.file)))
            return yield* InvalidInput.make({ message: "Root ownership cannot hide workspace source." });
        } else {
          if (!A.some(packages, (pkg) => pkg.name === entry.package && Str.startsWith(`${pkg.root}/`)(entry.file)))
            return yield* InvalidInput.make({ message: `Invalid inventory ownership: ${entry.file}` });
        }
        if (entry.executable && entry.classification === "data")
          return yield* InvalidInput.make({ message: `Executable classified as data: ${entry.file}` });
      }
      return {
        collect: Effect.fn("SourceInventory.collect")(function* (sourceRoot: string) {
          if (sourceRoot !== root)
            return yield* InvalidInput.make({ message: "Inventory root does not match bound source tree." });
          const output = yield* spawner
            .string(
              ChildProcess.make("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root })
            )
            .pipe(Effect.mapError(infra));
          const files = A.filter(Str.split(output, "\0"), (file) => file !== "");
          const activeRoots = A.flatMap(packages, (pkg) =>
            A.some(scope.files, (entry) => entry.package === pkg.name && entry.classification === "active")
              ? [
                  `${pkg.root}/src`,
                  `${pkg.root}/test`,
                  ...(pkg.name === "vidbee-extension" ? [`${pkg.root}/entrypoints`] : []),
                ]
              : []
          );
          if (activeRoots.length > 0) {
            const ignored = yield* spawner
              .string(
                ChildProcess.make(
                  "git",
                  ["ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--", ...activeRoots],
                  { cwd: root }
                )
              )
              .pipe(Effect.mapError(infra));
            if (A.some(Str.split(ignored, "\0"), (file) => /\.[cm]?[jt]sx?$/.test(file)))
              return yield* InvalidInput.make({ message: "Ignored executable source in an active workspace." });
          }

          for (const file of files) {
            if (!HashSet.has(known, file)) return yield* InvalidInput.make({ message: `Unclassified file: ${file}` });
          }
          for (const entry of scope.files) {
            if (!A.contains(files, entry.file))
              return yield* InvalidInput.make({ message: `Scope member disappeared: ${entry.file}` });
            const absolute = path.join(root, entry.file);
            const stat = yield* fs.lstat(absolute).pipe(Effect.mapError(infra));
            if (stat.type === "SymbolicLink") {
              const resolved = yield* fs.realPath(absolute).pipe(Effect.mapError(infra));
              if (!Str.startsWith(`${root}/`)(resolved))
                return yield* InvalidInput.make({ message: `Scope symlink escapes source root: ${entry.file}` });
            }
          }
          for (const pkg of packages) {
            if (!A.some(scope.files, (entry) => entry.package === pkg.name))
              return yield* InvalidInput.make({ message: `Unclassified workspace: ${pkg.name}` });
          }
          return scope.files;
        }),
        select: Effect.fn("SourceInventory.select")(function* (
          selectors: ReadonlyArray<string>,
          files: ReadonlyArray<string>
        ) {
          const chosen = HashSet.fromIterable(selectors);
          let selected = chosen;
          for (const selector of selectors) {
            if (!A.some(packages, (pkg) => pkg.name === selector))
              return yield* InvalidInput.make({ message: `Unknown package: ${selector}` });
          }
          for (const file of files) {
            const entry = A.findFirst(scope.files, (entry) => entry.file === file);
            if (entry._tag === "None") return yield* InvalidInput.make({ message: `Unknown selected file: ${file}` });
            if (entry.value.package === "vidbee-workspace")
              selected = HashSet.fromIterable(A.map(packages, (pkg) => pkg.name));
            else selected = HashSet.add(selected, entry.value.package);
          }
          const full = (selectors.length === 0 && files.length === 0) || HashSet.size(selected) === packages.length;
          if (full) selected = HashSet.fromIterable(A.map(packages, (pkg) => pkg.name));
          return CheckScope.make({
            packages: A.fromIterable(selected),
            files: A.map(
              A.filter(scope.files, (entry) => full || HashSet.has(selected, entry.package)),
              (entry) => entry.file
            ),
            full,
          });
        }),
      };
    })
  );
