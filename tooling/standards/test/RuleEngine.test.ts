import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Str from "effect/String";
import { Reporter, ReporterLive } from "../src/Reporter.service.js";
import { RuleEngine, ruleEngineLayer } from "../src/RuleEngine.service.js";
import {
  CheckReport,
  CheckScope,
  Digest,
  Finding,
  NodeView,
  RelativeFile,
  RuleMetadata,
  SourcePosition,
  SourceRange,
} from "../src/Standards.model.js";

const metadata = RuleMetadata.make({
  id: "infrastructure-proof",
  codes: ["proof"],
  laws: [],
  predicateVersion: 1,
  applicability: ["active"],
  fixtures: [],
  reviews: [],
  zeroOnly: true,
});
const position = SourcePosition.make({ line: 1, column: 1, offset: 0 });
const finding = Finding.make({
  package: "@vidbee/standards",
  file: RelativeFile.make("tooling/standards/test/fixture.ts"),
  rule: "infrastructure-proof",
  code: "proof",
  kind: "candidate",
  range: SourceRange.make({ start: position, end: position }),
  subject: "proof-node",
  evidence: ["owned facade node"],
  message: "Proof fixture only.",
  fingerprint: Digest.make(Str.repeat(64)("0")),
});
const proof = {
  metadata,
  inspect: (nodes: ReadonlyArray<NodeView>) => Effect.succeed(nodes.length === 0 ? [] : [finding]),
};
it.layer(Layer.mergeAll(ruleEngineLayer([proof]), ReporterLive))("registry through reporting", (it) => {
  it.effect("routes facade data through one trivial rule and serializes the counted candidate", () =>
    Effect.gen(function* () {
      const engine = yield* RuleEngine;
      const reporter = yield* Reporter;
      const observations = yield* engine.run([
        NodeView.make({
          file: "fixture.ts",
          kind: "Identifier",
          start: 0,
          end: 1,
          text: "x",
          type: "string",
          properties: [],
          symbol: O.none(),
        }),
      ]);
      const report = CheckReport.make({
        version: 1,
        scope: CheckScope.make({ packages: ["@vidbee/standards"], files: [], full: false }),
        coverage: [],
        findings: observations,
        stages: ["proof-rule"],
        incomplete: ["Law rules not enrolled."],
      });
      const json = yield* reporter.json(report);
      expect(json).toContain('"kind":"candidate"');
      expect(reporter.human(report)).toContain("infrastructure-proof/proof candidate");
      const empty = yield* engine.run([]);
      expect(empty).toEqual([]);
    })
  );
});
