import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Stream from "effect/Stream";
import * as Str from "effect/String";
import { InfrastructureFailure } from "../Standards.errors.js";
import { CompilerRun } from "../Standards.model.js";
import { CompilerHost } from "./CompilerHost.service.js";

const $I = $StandardsId.create("compiler/CompilerExecution.service");
/**
 * CompilerExecution supplies the owned CompilerExecution infrastructure capability.
 *
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide CompilerExecution at a Node entrypoint)
 *
 * ```ts
 * import { CompilerHostLive, CompilerExecution, compilerExecutionLayer } from "@vidbee/standards"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * import * as Layer from "effect/Layer"
 * NodeRuntime.runMain(
 *   CompilerExecution.use((compiler) => compiler.compile("tsconfig.json")).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(compilerExecutionLayer("node_modules/.bin/tsrs").pipe(Layer.provide(CompilerHostLive), Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class CompilerExecution extends Context.Service<
  CompilerExecution,
  {
    readonly compile: (project: string) => Effect.Effect<CompilerRun, InfrastructureFailure>;
  }
>()($I`CompilerExecution`) {}
/** Execute the installed acceptance compiler freshly; API diagnostics alone are insufficient.
 *
 * **When to use**
 * Use to execute the capability with explicit layer and scope ownership.
 *
 * **Example** (Provide compilerExecutionLayer at a Node entrypoint)
 *
 * ```ts
 * import { CompilerHostLive, CompilerExecution, compilerExecutionLayer } from "@vidbee/standards"
 * import * as Effect from "effect/Effect"
 * import * as Console from "effect/Console"
 * import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
 * import * as NodeServices from "@effect/platform-node/NodeServices"
 * import * as Layer from "effect/Layer"
 * NodeRuntime.runMain(
 *   CompilerExecution.use((compiler) => compiler.compile("tsconfig.json")).pipe(
 *     Effect.tap(Console.log),
 *     Effect.scoped,
 *     Effect.provide(compilerExecutionLayer("node_modules/.bin/tsrs").pipe(Layer.provide(CompilerHostLive), Layer.provide(NodeServices.layer)))
 *   )
 * )
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export const compilerExecutionLayer = (executable: string) =>
  Layer.effect(
    CompilerExecution,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const host = yield* CompilerHost;
      const path = yield* Path.Path;
      return {
        compile: Effect.fn("CompilerExecution.compile")(function* (project: string) {
          return yield* Effect.gen(function* () {
            const session = yield* host.open(project);
            const child = yield* spawner.spawn(
              ChildProcess.make(executable, [
                "-p",
                project,
                "--noEmit",
                "--incremental",
                "false",
                "--composite",
                "false",
                "--listFiles",
              ])
            );
            const result = yield* Effect.all(
              {
                exitCode: child.exitCode,
                stdout: child.stdout.pipe(Stream.decodeText, Stream.mkString),
                stderr: child.stderr.pipe(Stream.decodeText, Stream.mkString),
              },
              { concurrency: "unbounded" }
            );
            const files = A.filter(
              Str.split(result.stdout, "\n"),
              (file) => path.isAbsolute(file) && /\.[cm]?[jt]sx?$/.test(file)
            );
            const acceptance = HashSet.fromIterable(A.filter(files, (file) => !Str.includes("/node_modules/")(file)));
            const analysis = HashSet.fromIterable(
              A.filter(session.files, (file) => !Str.includes("/node_modules/")(file) && /\.[cm]?[jt]sx?$/.test(file))
            );
            if (!HashSet.isSubset(analysis, acceptance) || !HashSet.isSubset(acceptance, analysis))
              return yield* InfrastructureFailure.make({
                message: "TypeScript analysis and installed tsrs disagree on project source membership.",
                cause: { analysis: A.fromIterable(analysis), acceptance: A.fromIterable(acceptance) },
              });
            return CompilerRun.make({ project, ...result, files });
          }).pipe(
            Effect.scoped,
            Effect.mapError((cause) =>
              InfrastructureFailure.make({ message: "Installed compiler execution failed.", cause })
            )
          );
        }),
      };
    })
  );
