import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { CheckReport as Report } from "./Standards.model.js";
import type { SchemaError } from "effect/Schema";
import type { CheckReport } from "./Standards.model.js";

const $I = $StandardsId.create("Reporter.service");
/**
 * Reporter supplies the owned Reporter infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide Reporter at a Node entrypoint)
 *
 * ```ts
 * import { Reporter, ReporterLive, CheckReport, CheckScope } from "@vidbee/standards"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * NodeRuntime.runMain(
 *   Reporter.use((reporter) => Effect.succeed(reporter.human(CheckReport.make({version: 1, scope: CheckScope.make({packages: [], files: [], full: true}), coverage: [], findings: [], stages: [], incomplete: []})))).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(ReporterLive.pipe(Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class Reporter extends Context.Service<
  Reporter,
  {
    readonly json: (report: CheckReport) => Effect.Effect<string, SchemaError>;
    readonly human: (report: CheckReport) => string;
  }
>()($I`Reporter`) {}
/** Render one versioned JSON object; callers own stdout and stderr placement.
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide ReporterLive at a Node entrypoint)
 *
 * ```ts
 * import { Reporter, ReporterLive, CheckReport, CheckScope } from "@vidbee/standards"
 * import * as Layer from "effect/Layer"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * NodeRuntime.runMain(
 *   Reporter.use((reporter) => Effect.succeed(reporter.human(CheckReport.make({version: 1, scope: CheckScope.make({packages: [], files: [], full: true}), coverage: [], findings: [], stages: [], incomplete: []})))).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(ReporterLive.pipe(Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export const ReporterLive = Layer.succeed(Reporter, {
  json: Effect.fn("Reporter.json")((report: CheckReport) => S.encodeEffect(S.fromJsonString(Report))(report)),
  human: (report) =>
    A.join(
      [
        `Scope: ${A.join(report.scope.packages, ", ")} (${report.scope.full ? "full" : "bounded"})`,
        ...A.map(
          report.findings,
          (finding) =>
            `${finding.file}:${finding.range.start.line}:${finding.range.start.column} ${finding.rule}/${finding.code} ${finding.kind}: ${Str.replace(/\/home\/[^/]+/g, "~")(finding.message)}`
        ),
        ...A.map(report.incomplete, (stage) => `Incomplete: ${stage}`),
      ],
      "\n"
    ),
});
