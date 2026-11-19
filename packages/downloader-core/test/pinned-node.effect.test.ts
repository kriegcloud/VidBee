import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Result from "effect/Result";
import { pinnedNode } from "./fixtures/pinned-node.js";

layer(NodeServices.layer)("native fixture Node prerequisites", (it) => {
  it.effect("missing Node on PATH fails the prerequisite", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-node-absent-" });
      const result = yield* Effect.result(
        pinnedNode.pipe(
          Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({ PATH: directory }))
        )
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(result.failure._tag).toBe("NodePrerequisite");
    })
  );
  it.effect("wrong PATH-selected Node version fails without a fallback interpreter", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "vidbee-node-wrong-" });
      const binary = `${directory}/node`;
      yield* fs.writeFileString(binary, "#!/bin/sh\nprintf 'v0.0.0\\n'\n");
      yield* fs.chmod(binary, 0o755);
      const result = yield* Effect.result(
        pinnedNode.pipe(
          Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({ PATH: directory }))
        )
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result) && result.failure._tag === "NodePrerequisite") {
        expect(result.failure.candidate).toBe(binary);
        expect(result.failure.detail).toBe("Expected v22.23.4; observed v0.0.0");
      }
    })
  );
});
