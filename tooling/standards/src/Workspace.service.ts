import { $StandardsId } from "@vidbee/identity/packages";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { InfrastructureFailure, InvalidInput } from "./Standards.errors.js";
import type { CheckScope, InventoryFile, WorkspaceManifest } from "./Standards.model.js";

const $I = $StandardsId.create("Workspace.service");
/**
 * Workspace supplies the owned Workspace infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide Workspace at a Node entrypoint)
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
 * @category services
 * @since 0.0.0
 */
export class Workspace extends Context.Service<
  Workspace,
  {
    readonly discover: (
      root: string
    ) => Effect.Effect<ReadonlyArray<WorkspaceManifest>, InvalidInput | InfrastructureFailure>;
  }
>()($I`Workspace`) {}
/**
 * SourceInventory supplies the owned SourceInventory infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide SourceInventory at a Node entrypoint)
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
 * @category services
 * @since 0.0.0
 */
export class SourceInventory extends Context.Service<
  SourceInventory,
  {
    readonly collect: (
      root: string
    ) => Effect.Effect<ReadonlyArray<InventoryFile>, InvalidInput | InfrastructureFailure>;
    readonly select: (
      packages: ReadonlyArray<string>,
      files: ReadonlyArray<string>
    ) => Effect.Effect<CheckScope, InvalidInput>;
  }
>()($I`SourceInventory`) {}
