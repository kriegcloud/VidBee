import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Policy, PolicyLive } from "../src/Policy.service.js";
import { Toolchain, ToolchainLive } from "../src/Toolchain.service.js";

const dependencies = Layer.mergeAll(NodeServices.layer, NodeCrypto.layerDigest);
it.layer(Layer.mergeAll(PolicyLive, ToolchainLive).pipe(Layer.provideMerge(dependencies)))(
  "policy provenance",
  (it) => {
    it.effect("checks editions and immutable compiler projection without the reference repository", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const policy = yield* Policy;
        const tools = yield* Toolchain;
        const root = path.resolve(import.meta.dirname, "../../..");
        yield* policy.validate(root);
        yield* tools.validate(root);
      })
    );
    it.effect("rejects a local edition digest mismatch", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const policy = yield* Policy;
        const temporary = path.resolve(import.meta.dirname, "../.cache/policy-fixtures");
        yield* fs.makeDirectory(temporary, { recursive: true });
        const root = yield* fs.makeTempDirectoryScoped({ directory: temporary, prefix: "policy-" });
        yield* fs.makeDirectory(path.join(root, "standards"));
        yield* fs.writeFileString(path.join(root, "edition.md"), "changed source");
        yield* fs.writeFileString(
          path.join(root, "standards/sources.json"),
          '{"version":1,"referenceRevision":"fixture","sources":[{"source":"source.md","revision":"fixture","sourceDigest":"0000000000000000000000000000000000000000000000000000000000000000","local":"edition.md","localDigest":"0000000000000000000000000000000000000000000000000000000000000000","adaptations":["fixture"]}]}'
        );
        const result = yield* policy.validate(root).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure.message).toContain("digest mismatch");
      })
    );
  }
);

it.layer(ToolchainLive.pipe(Layer.provideMerge(NodeServices.layer)))("tool version refusal", (it) => {
  it.effect("rejects a mismatched first tool before inspecting later tools", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tools = yield* Toolchain;
      const temporary = path.resolve(import.meta.dirname, "../.cache/version-fixtures");
      yield* fs.makeDirectory(temporary, { recursive: true });
      const root = yield* fs.makeTempDirectoryScoped({ directory: temporary, prefix: "version-" });
      yield* fs.makeDirectory(path.join(root, "node_modules/effect"), { recursive: true });
      yield* fs.writeFileString(path.join(root, "node_modules/effect/package.json"), '{"version":"0.0.0"}');
      const result = yield* tools.validate(root).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("InvalidInput");
        expect(result.failure.message).toBe("Tool version mismatch: effect; expected 4.1.4, found 0.0.0");
      }
    })
  );
  it.effect("reports malformed and missing manifests without inventing a version", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tools = yield* Toolchain;
      const temporary = path.resolve(import.meta.dirname, "../.cache/version-fixtures");
      yield* fs.makeDirectory(temporary, { recursive: true });
      const root = yield* fs.makeTempDirectoryScoped({ directory: temporary, prefix: "missing-" });
      const missing = yield* tools.validate(root).pipe(Effect.result);
      expect(missing._tag).toBe("Failure");
      if (missing._tag === "Failure") expect(missing.failure._tag).toBe("InfrastructureFailure");
      yield* fs.makeDirectory(path.join(root, "node_modules/effect"), { recursive: true });
      yield* fs.writeFileString(path.join(root, "node_modules/effect/package.json"), "{}");
      const malformed = yield* tools.validate(root).pipe(Effect.result);
      expect(malformed._tag).toBe("Failure");
      if (malformed._tag === "Failure") expect(malformed.failure.message).toBe("Invalid tool manifest: effect");
    })
  );
});
