import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as ContentDigest from "effect/crypto/Digest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { CompilerHost } from "./compiler/CompilerHost.service.js";
import { inspectLaws } from "./LawRules.js";
import { InfrastructureFailure } from "./Standards.errors.js";
import { Digest, Finding, RelativeFile } from "./Standards.model.js";
import { SourceInventory, Workspace } from "./Workspace.service.js";
import type { InvalidInput } from "./Standards.errors.js";
import type { CheckScope } from "./Standards.model.js";

const $I = $StandardsId.create("LawScan.service");
const AnalysisProject = S.Struct({
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
  exclude: S.Array(S.String),
}).pipe(
  $I.annoteSchema("AnalysisProject", { description: "Run-owned project preserving package resolution and strictness." })
);
/** Execute AST recognition on the complete selected source membership.
 * @category services
 * @since 0.0.0
 */
export class LawScan extends Context.Service<
  LawScan,
  {
    readonly run: (
      root: string,
      scope: CheckScope
    ) => Effect.Effect<ReadonlyArray<Finding>, InfrastructureFailure | InvalidInput>;
  }
>()($I`LawScan`) {}
/** Each project/snapshot and its temporary configuration close before the next package.
 * @category layers
 * @since 0.0.0
 */
export const LawScanLive = Layer.effect(
  LawScan,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const host = yield* CompilerHost;
    const inventory = yield* SourceInventory;
    const workspace = yield* Workspace;
    const digest = yield* ContentDigest.Digest;
    return {
      run: Effect.fn("LawScan.run")(function* (root: string, scope: CheckScope) {
        const files = yield* inventory.collect(root);
        const packages = yield* workspace.discover(root);
        const temporaryRoot = path.join(root, "tooling/standards/.cache/law-scan");
        yield* fs
          .makeDirectory(temporaryRoot, { recursive: true })
          .pipe(
            Effect.mapError((cause) =>
              InfrastructureFailure.make({ message: "Cannot create law run directory.", cause })
            )
          );
        let findings: ReadonlyArray<Finding> = [];
        let seen = HashSet.empty<string>();
        for (const pkg of [...packages, { name: "vidbee-workspace", projects: [] }]) {
          const selected = A.filter(
            files,
            (file) =>
              file.package === pkg.name &&
              file.executable &&
              A.contains(scope.files, file.file) &&
              A.contains(["active", "compatibility-owner", "pending-deletion", "pending-port"], file.classification)
          );
          if (selected.length === 0) continue;
          const observed = yield* Effect.gen(function* () {
            const directory = yield* fs.makeTempDirectoryScoped({ directory: temporaryRoot, prefix: "project-" });
            const project = path.join(directory, "tsconfig.json");
            const encoded = yield* S.encodeEffect(S.fromJsonString(AnalysisProject))({
              extends: path.join(root, pkg.projects[0] ?? "tsconfig.base.json"),
              compilerOptions: {
                allowJs: true,
                checkJs: true,
                noEmit: true,
                composite: false,
                incremental: false,
                rootDir: root,
              },
              files: A.map(selected, (file) => path.join(root, file.file)),
              include: [],
              exclude: [],
            });
            yield* fs.writeFileString(project, encoded);
            const session = yield* host.open(project);
            let result: ReadonlyArray<Finding> = [];
            let occurrences = HashMap.empty<string, number>();
            for (const file of selected) {
              const facts = yield* session.laws(path.join(root, file.file));
              for (const observation of inspectLaws(file.file, facts)) {
                // Preserve literal bytes and distinguish repeated observations within the same owner.
                const normalized = observation.subject;
                const occurrenceKey = `${file.file}\0${observation.code}\0${normalized}`;
                const ordinal = O.getOrElse(HashMap.get(occurrences, occurrenceKey), () => 0);
                occurrences = HashMap.set(occurrences, occurrenceKey, ordinal + 1);
                const hash = yield* digest.digestHex(
                  ContentDigest.sha256,
                  new TextEncoder().encode(
                    `${file.package}\0${file.file}\0${observation.rule}\0${observation.code}\0${normalized}\0${ordinal}`
                  )
                );
                result = A.append(
                  result,
                  Finding.make({
                    ...observation,
                    package: file.package,
                    file: RelativeFile.make(file.file),
                    fingerprint: Digest.make(hash),
                    evidence: A.map(observation.evidence, (value) =>
                      Str.replace(/\/home\/[^/]+/g, "~")(Str.replaceAll(root, ".")(value))
                    ),
                  })
                );
              }
            }
            return result;
          }).pipe(
            Effect.scoped,
            Effect.mapError((cause) =>
              InfrastructureFailure.make({ message: `Law scan failed for ${pkg.name}.`, cause })
            )
          );
          for (const finding of observed) {
            const key = `${finding.file}\0${finding.code}\0${finding.range.start.offset}\0${finding.range.end.offset}`;
            if (HashSet.has(seen, key)) continue;
            seen = HashSet.add(seen, key);
            findings = A.append(findings, finding);
          }
        }
        return findings;
      }),
    };
  })
);
