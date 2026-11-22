import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as S from "effect/Schema";
import * as Str from "effect/String";

const Observation = S.Struct({ code: S.String, kind: S.String, start: S.Int, end: S.Int }).pipe(
  $StandardsId
    .create("test/LawRules.test")
    .annoteSchema("Observation", { description: "Validated Observation fixture data." })
);
const Results = S.Array(
  S.Struct({ name: S.String, expected: S.Array(Observation), actual: S.Array(Observation) })
).pipe(
  $StandardsId.create("test/LawRules.test").annoteSchema("Results", { description: "Validated Results fixture data." })
);
it.layer(NodeServices.layer)("semantic law fixtures", (it) => {
  it.effect("matches every expected code, kind and exact UTF-16 range, including negative neighbors", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const home = yield* Config.String("HOME");
      const version = yield* fs.readFileString(path.resolve(import.meta.dirname, "../../../.node-version"));
      const node = path.join(home, ".local/share/mise/installs/node", Str.trim(version), "bin/node");
      const text = yield* spawner.string(
        ChildProcess.make(node, ["--import", "tsx", path.join(import.meta.dirname, "LawProbe.entry.ts")])
      );
      const results = yield* S.decodeEffect(S.fromJsonString(Results))(text);
      expect(results.length).toBeGreaterThan(60);
      for (const result of results) expect(result.actual, result.name).toEqual(result.expected);
      expect(A.some(results, (result) => result.name === "native-static-json-neighbor")).toBe(true);
    })
  );
});
