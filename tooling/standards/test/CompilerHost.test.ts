import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { IdentityCompatibilityManifest } from "@vidbee/identity";
import * as A from "effect/Array";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { SourcePosition, SourceRange } from "../src/Standards.model.js";
import { CoverageProbeReport, ProbeReport } from "./Probe.model.js";

it.layer(NodeServices.layer)("Node compiler runtime", (it) => {
  it.effect("checks real wrapped semantics, closure, failure cleanup and reacquisition", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const home = yield* Config.String("HOME");
      const version = yield* fs.readFileString(path.resolve(import.meta.dirname, "../../../.node-version"));
      const node = path.join(home, ".local/share/mise/installs/node", Str.trim(version), "bin/node");
      const text = yield* spawner.string(
        ChildProcess.make(node, ["--import", "tsx", path.resolve(import.meta.dirname, "CompilerProbe.entry.ts")]),
        { includeStderr: true }
      );
      expect(text).toContain("files");
      const report = yield* S.decodeEffect(S.fromJsonString(ProbeReport))(text);
      expect(report).toEqual({
        files: true,
        shadow: true,
        exportsResolved: true,
        wrapped: true,
        intersection: true,
        union: true,
        diagnosticCount: 0,
        closed: true,
        failed: true,
        reacquired: true,
        interrupted: true,
      });
    })
  );
});
describe("source coordinates", () => {
  it.effect("rejects invalid coordinate bounds and reversed ranges", () =>
    Effect.sync(() => {
      expect(S.is(SourcePosition)({ line: 0, column: 1, offset: 0 })).toBe(false);
      expect(
        S.is(SourceRange)({ start: { line: 1, column: 2, offset: 1 }, end: { line: 1, column: 1, offset: 0 } })
      ).toBe(false);
    })
  );
});

it.layer(NodeServices.layer)("identity source freeze", (it) => {
  it.effect("decodes every frozen source subject without treating source capture as runtime proof", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const text = yield* fs.readFileString(
        path.resolve(import.meta.dirname, "../../../standards/identity-parity.json")
      );
      const manifest = yield* S.decodeEffect(S.fromJsonString(IdentityCompatibilityManifest), {
        onExcessProperty: "error",
      })(text);
      expect(manifest.entries.length).toBeGreaterThan(0);
      expect(manifest.proofState).toBe("source-frozen-runtime-unverified");
      expect(A.every(manifest.entries, (entry) => !entry.runtimeVerified)).toBe(true);
    })
  );
});

it.layer(NodeServices.layer)("compiler coverage", (it) => {
  it.effect("executes supplemental JavaScript and declaration projects without directory-name exclusions", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const home = yield* Config.String("HOME");
      const version = yield* fs.readFileString(path.resolve(import.meta.dirname, "../../../.node-version"));
      const node = path.join(home, ".local/share/mise/installs/node", Str.trim(version), "bin/node");
      const text = yield* spawner.string(
        ChildProcess.make(node, ["--import", "tsx", path.resolve(import.meta.dirname, "CoverageProbe.entry.ts")]),
        { includeStderr: true }
      );
      expect(text).toContain("complete");
      const report = yield* S.decodeEffect(S.fromJsonString(CoverageProbeReport))(text);
      expect(report).toEqual({
        complete: true,
        javascript: true,
        declaration: true,
        passed: true,
        supplemental: true,
        cleaned: true,
        unchanged: true,
      });
    })
  );
});
