import { $StandardsId } from "@vidbee/identity/packages";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as S from "effect/Schema";
import { InfrastructureFailure, InvalidInput } from "./Standards.errors.js";

const $I = $StandardsId.create("Toolchain.service");
const ToolVersion = S.Struct({ version: S.String }).pipe(
  $I.annoteSchema("ToolVersion", { description: "Installed package version consumed at startup." })
);
/**
 * Toolchain supplies the owned Toolchain infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide Toolchain at a Node entrypoint)
 *
 * ```ts
 * import { Toolchain, ToolchainLive } from "@vidbee/standards"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * NodeRuntime.runMain(
 *   Toolchain.use((toolchain) => toolchain.validate(".")).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(ToolchainLive.pipe(Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class Toolchain extends Context.Service<
  Toolchain,
  { readonly validate: (root: string) => Effect.Effect<void, InvalidInput | InfrastructureFailure> }
>()($I`Toolchain`) {}
/**
 * ToolchainLive supplies the owned ToolchainLive infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide ToolchainLive at a Node entrypoint)
 *
 * ```ts
 * import { Toolchain, ToolchainLive } from "@vidbee/standards"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * NodeRuntime.runMain(
 *   Toolchain.use((toolchain) => toolchain.validate(".")).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(ToolchainLive.pipe(Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const ToolchainLive = Layer.effect(
  Toolchain,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return {
      validate: Effect.fn("Toolchain.validate")(function* (root: string) {
        for (const [name, version] of [
          ["effect", "4.1.4"],
          ["typescript", "7.0.2"],
          ["@effect/tsgo", "0.70.0"],
          ["tsrs", "0.25.0-ts7.1.0-beta"],
          ["vitest", "5.1.0"],
          ["@effect/doctest", "4.1.4"],
        ]) {
          if (name === undefined || version === undefined)
            return yield* InvalidInput.make({ message: "Invalid compiled toolchain requirement." });
          const raw = yield* fs
            .readFileString(path.join(root, "node_modules", name, "package.json"))
            .pipe(
              Effect.mapError((cause) =>
                InfrastructureFailure.make({ message: "Cannot read installed tool version.", cause })
              )
            );
          const installed = yield* S.decodeEffect(S.fromJsonString(ToolVersion))(raw).pipe(
            Effect.mapError(() => InvalidInput.make({ message: `Invalid tool manifest: ${name}` }))
          );
          if (installed.version !== version)
            return yield* InvalidInput.make({
              message: `Tool version mismatch: ${name}; expected ${version}, found ${installed.version}`,
            });
        }
      }),
    };
  })
);
