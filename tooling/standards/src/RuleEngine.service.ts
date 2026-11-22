import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { InfrastructureFailure } from "./Standards.errors.js";
import type { Finding, NodeView, RuleMetadata } from "./Standards.model.js";

const $I = $StandardsId.create("RuleEngine.service");
/** Rule call protocol; all upstream semantics are supplied as owned facade data.
 * @category services
 * @since 0.0.0
 */
export interface Rule {
  readonly inspect: (nodes: ReadonlyArray<NodeView>) => Effect.Effect<ReadonlyArray<Finding>, InfrastructureFailure>;
  readonly metadata: RuleMetadata;
}
/**
 * RuleEngine supplies the owned RuleEngine infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide RuleEngine at a Node entrypoint)
 *
 * ```ts
 * import { RuleEngine, ruleEngineLayer } from "@vidbee/standards"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * NodeRuntime.runMain(
 *   RuleEngine.use((engine) => engine.run([])).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(ruleEngineLayer([]).pipe(Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class RuleEngine extends Context.Service<
  RuleEngine,
  { readonly run: (nodes: ReadonlyArray<NodeView>) => Effect.Effect<ReadonlyArray<Finding>, InfrastructureFailure> }
>()($I`RuleEngine`) {}
/** Build a registry layer without installing any law recognizers implicitly.
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide ruleEngineLayer at a Node entrypoint)
 *
 * ```ts
 * import { RuleEngine, ruleEngineLayer } from "@vidbee/standards"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * NodeRuntime.runMain(
 *   RuleEngine.use((engine) => engine.run([])).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(ruleEngineLayer([]).pipe(Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export const ruleEngineLayer = (rules: ReadonlyArray<Rule>) =>
  Layer.succeed(RuleEngine, {
    run: Effect.fn("RuleEngine.run")(function* (nodes: ReadonlyArray<NodeView>) {
      const findings = yield* Effect.forEach(rules, (rule) => rule.inspect(nodes), { concurrency: 1 });
      return A.flatten(findings);
    }),
  });
