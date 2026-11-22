import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { $IdentityId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import { CompilerExecution, compilerExecutionLayer } from "../src/compiler/CompilerExecution.service.js";
import { CompilerHostLive } from "../src/compiler/CompilerHost.layer.js";
import { CompilerHost } from "../src/compiler/CompilerHost.service.js";
import { ProbeReport } from "./Probe.model.js";

const FixtureConfig = S.Struct({
  compilerOptions: S.Struct({
    target: S.String,
    module: S.String,
    moduleResolution: S.String,
    noEmit: S.Boolean,
    strict: S.Boolean,
  }),
  files: S.Array(S.String),
});
NodeRuntime.runMain(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const host = yield* CompilerHost;
    const compiler = yield* CompilerExecution;
    const temporary = path.resolve(import.meta.dirname, "../.cache/compiler-fixtures");
    yield* fs.makeDirectory(temporary, { recursive: true });
    const directory = yield* fs.makeTempDirectoryScoped({ directory: temporary, prefix: "snapshot-" });
    const file = path.join(directory, "source.ts");
    const config = path.join(directory, "tsconfig.json");
    yield* fs.writeFileString(
      file,
      "export type Direct = { label: string }; export type Wrapped = Readonly<Direct>; export type Joined = Direct & { count: number }; export type Variant = Direct | { other: boolean }; export const value: Wrapped = { label: 'ok' };\n"
    );
    const encoded = yield* S.encodeEffect(S.fromJsonString(FixtureConfig))({
      compilerOptions: {
        target: "ESNext",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        strict: true,
      },
      files: [file],
    });
    yield* fs.writeFileString(config, encoded);
    const observed = yield* Effect.scoped(
      Effect.gen(function* () {
        const session = yield* host.open(config);
        const nodes = yield* session.inspect(file);
        const diagnostics = yield* session.diagnostics;
        const exported = yield* session.exports(file);
        return {
          session,
          exportsResolved: A.some(
            exported,
            (entry) =>
              entry.name === "Wrapped" && A.contains(entry.properties, "label") && entry.declarations.length > 0
          ),
          files: A.contains(session.files, file),
          wrapped: A.some(nodes, (node) => node.text === "Wrapped" && A.contains(node.properties, "label")),
          intersection: A.some(nodes, (node) => node.text === "Joined" && A.contains(node.properties, "count")),
          union: A.some(nodes, (node) => node.text === "Variant" && A.contains(node.properties, "other")),
          diagnosticCount: diagnostics.length,
        };
      })
    );
    const closed = yield* Effect.result(observed.session.inspect(file));
    const failed = yield* Effect.scoped(
      Effect.gen(function* () {
        const session = yield* host.open(config);
        return yield* session.inspect("missing.ts");
      })
    ).pipe(Effect.result);
    const reacquired = yield* Effect.scoped(
      Effect.gen(function* () {
        const session = yield* host.open(config);
        return session.files.length > 0;
      })
    );

    const mirroredRoot = path.join(directory, "packages/identity");
    yield* fs.makeDirectory(path.join(mirroredRoot, "src/nested"), { recursive: true });
    yield* fs.writeFileString(path.join(mirroredRoot, "package.json"), '{"name":"@vidbee/identity","type":"module"}');
    const literal = $IdentityId.create("nested/index")`Foo`;
    yield* fs.writeFileString(
      path.join(mirroredRoot, "src/nested/index.ts"),
      `import * as Context from "effect/Context"; export class Foo extends Context.Service<Foo, {}>()("${literal}") {}`
    );
    const shadowConfig = path.join(mirroredRoot, "tsconfig.json");
    const configText = `{"extends":"${path.resolve(import.meta.dirname, "../../../tsconfig.base.json")}","compilerOptions":{"rootDir":"src","composite":false,"incremental":false,"noEmit":true},"include":["src"]}`;
    yield* fs.writeFileString(shadowConfig, configText);
    const shadow = yield* compiler.compile(shadowConfig);
    const report = ProbeReport.make({
      shadow: shadow.exitCode === 0,
      exportsResolved: observed.exportsResolved,
      files: observed.files,
      wrapped: observed.wrapped,
      intersection: observed.intersection,
      union: observed.union,
      diagnosticCount: observed.diagnosticCount,
      closed: closed._tag === "Failure",
      failed: failed._tag === "Failure",
      reacquired,
    });
    const json = yield* S.encodeEffect(S.fromJsonString(ProbeReport))(report);
    yield* Console.log(json);
  }).pipe(
    Effect.scoped,
    Effect.provide(
      compilerExecutionLayer(`${import.meta.dirname}/../../../node_modules/.bin/tsrs`).pipe(
        Layer.provideMerge(CompilerHostLive),
        Layer.provideMerge(NodeServices.layer)
      )
    )
  )
);
