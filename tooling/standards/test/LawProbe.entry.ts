import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import { CompilerHostLive } from "../src/compiler/CompilerHost.layer.js";
import { CompilerHost } from "../src/compiler/CompilerHost.service.js";
import { inspectLaws } from "../src/LawRules.js";

const Expected = S.Struct({ code: S.String, kind: S.String, start: S.Int, end: S.Int }).pipe(
  $StandardsId
    .create("test/LawProbe.entry")
    .annoteSchema("Expected", { description: "Validated Expected fixture data." })
);
const Fixture = S.Struct({ name: S.String, source: S.String, expected: S.Array(Expected) }).pipe(
  $StandardsId.create("test/LawProbe.entry").annoteSchema("Fixture", { description: "Validated Fixture fixture data." })
);
const Config = S.Struct({
  compilerOptions: S.Struct({
    target: S.String,
    module: S.String,
    moduleResolution: S.String,
    noEmit: S.Boolean,
    strict: S.Boolean,
    types: S.Array(S.String),
  }),
  files: S.Array(S.String),
}).pipe(
  $StandardsId.create("test/LawProbe.entry").annoteSchema("Config", { description: "Validated Config fixture data." })
);
NodeRuntime.runMain(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const host = yield* CompilerHost;
    const raw = yield* fs.readFileString(path.join(import.meta.dirname, "fixtures/laws.txt"));
    const fixtures = yield* S.decodeEffect(Fixture.pipe(S.Array, S.fromJsonString))(raw);
    const temporary = path.resolve(import.meta.dirname, "../.cache/law-fixtures");
    yield* fs.makeDirectory(temporary, { recursive: true });
    const directory = yield* fs.makeTempDirectoryScoped({ directory: temporary, prefix: "matrix-" });
    for (const fixture of fixtures)
      yield* fs.writeFileString(path.join(directory, `${fixture.name}.ts`), `${fixture.source}\nexport {};`);
    const config = path.join(directory, "tsconfig.json");
    const encoded = yield* S.encodeEffect(S.fromJsonString(Config))({
      compilerOptions: {
        target: "ESNext",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        types: ["node"],
      },
      files: A.map(fixtures, (fixture) => path.join(directory, `${fixture.name}.ts`)),
    });
    yield* fs.writeFileString(config, encoded);
    const session = yield* host.open(config);
    const results = yield* Effect.forEach(
      fixtures,
      Effect.fnUntraced(function* (fixture) {
        const facts = yield* session.laws(path.join(directory, `${fixture.name}.ts`));
        const observations = inspectLaws(`fixtures/${fixture.name}.ts`, facts);
        const actual = A.map(observations, (finding) => ({
          code: finding.code,
          kind: finding.kind,
          start: finding.range.start.offset,
          end: finding.range.end.offset,
        }));
        return { name: fixture.name, expected: fixture.expected, actual };
      }),
      { concurrency: 1 }
    );
    const json = yield* S.encodeEffect(
      S.Struct({ name: S.String, expected: S.Array(Expected), actual: S.Array(Expected) }).pipe(
        S.Array,
        S.fromJsonString
      )
    )(results);
    yield* Console.log(json);
  }).pipe(Effect.scoped, Effect.provide(CompilerHostLive.pipe(Layer.provideMerge(NodeServices.layer))))
);
