import { $StandardsId } from "@vidbee/identity/packages";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { LawFact } from "../Law.model.js";
import type { InfrastructureFailure } from "../Standards.errors.js";
import type { CompilerDiagnostic, NodeView, SemanticQuery, SemanticView } from "../Standards.model.js";

const $I = $StandardsId.create("compiler/CompilerHost.service");
/** A scoped query facade; upstream nodes never escape the owning snapshot.
 * @category services
 * @since 0.0.0
 */
export interface CompilerSession {
  readonly diagnostics: Effect.Effect<ReadonlyArray<CompilerDiagnostic>, InfrastructureFailure>;
  readonly exports: (file: string) => Effect.Effect<ReadonlyArray<SemanticView>, InfrastructureFailure>;
  readonly files: ReadonlyArray<string>;
  readonly inspect: (file: string) => Effect.Effect<ReadonlyArray<NodeView>, InfrastructureFailure>;
  readonly laws: (file: string) => Effect.Effect<ReadonlyArray<LawFact>, InfrastructureFailure>;
  readonly resolve: (query: SemanticQuery) => Effect.Effect<SemanticView, InfrastructureFailure>;
}
/**
 * CompilerHost supplies the owned CompilerHost infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide CompilerHost at a Node entrypoint)
 *
 * ```ts
 * import { CompilerHost, CompilerHostLive } from "@vidbee/standards"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * NodeRuntime.runMain(
 *   CompilerHost.use((host) => host.open("tsconfig.json")).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(CompilerHostLive.pipe(Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class CompilerHost extends Context.Service<
  CompilerHost,
  {
    readonly open: (project: string) => Effect.Effect<CompilerSession, InfrastructureFailure, Scope.Scope>;
  }
>()($I`CompilerHost`) {}
