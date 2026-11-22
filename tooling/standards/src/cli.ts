import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { $StandardsId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as O from "effect/Option";
import * as Runtime from "effect/Runtime";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { parseArguments } from "./Arguments.js";
import { Policy, PolicyLive } from "./Policy.service.js";
import { InvalidInput } from "./Standards.errors.js";
import { CheckReport } from "./Standards.model.js";
import { Toolchain, ToolchainLive } from "./Toolchain.service.js";
import { sourceInventoryLayer, WorkspaceLive } from "./Workspace.layer.js";
import { SourceInventory } from "./Workspace.service.js";
import type { CliOptions } from "./Cli.model.js";

const $I = $StandardsId.create("cli");
class Input extends Context.Service<Input, CliOptions>()($I`Input`) {}
const inputLayer = Layer.unwrap(
  Effect.map(parseArguments(A.drop(process.argv, 2)), (options) => {
    const root = O.getOrElse(options.sourceRoot, () => process.cwd());
    return Layer.mergeAll(
      Layer.succeed(Input, options),
      ToolchainLive,
      PolicyLive,
      sourceInventoryLayer(root).pipe(Layer.provide(WorkspaceLive))
    ).pipe(Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layerDigest)));
  })
);
NodeRuntime.runMain(
  Effect.gen(function* () {
    const options = yield* Input;
    const root = O.getOrElse(options.sourceRoot, () => process.cwd());
    const toolchain = yield* Toolchain;
    yield* toolchain.validate(root);
    const policy = yield* Policy;
    yield* policy.validate(root);
    const fs = yield* FileSystem.FileSystem;
    const list = O.isSome(options.filesFrom) ? yield* fs.readFileString(options.filesFrom.value) : "";
    const files = A.filter(Str.split(list, "\0"), (file) => file !== "");
    if (O.isSome(options.filesFrom) && files.length === 0)
      return yield* InvalidInput.make({ message: "files-from selects no files." });
    const inventory = yield* SourceInventory;
    yield* inventory.collect(root);
    const scope = yield* inventory.select(options.packages, files);
    const report = CheckReport.make({
      version: 1,
      scope,
      coverage: [],
      findings: [],
      stages: ["tools", "policy", "inventory", "scope"],
      incomplete: [
        "Compiler coverage, law rules, documentation, identity parity, reviews and ratchet are not activated by the infrastructure CLI.",
      ],
    });
    if (options.json) {
      const encoded = yield* S.encodeEffect(S.fromJsonString(CheckReport))(report);
      yield* Console.log(encoded);
    } else
      yield* Console.error(
        `Infrastructure only: ${report.scope.packages.length} packages inventoried. ${A.join(report.incomplete, " ")}`
      );
    yield* Effect.sync(() => {
      process.exitCode = 3;
    });
  }).pipe(
    Effect.catchTag("InvalidInput", (error) =>
      Effect.andThen(
        Console.error(error.message),
        Effect.sync(() => {
          process.exitCode = 2;
        })
      )
    ),
    Effect.catchCause((cause) =>
      Effect.andThen(
        Console.error(cause.pipe(Cause.pretty, Str.replace(/\/home\/[^/]+/g, "~"))),
        Effect.sync(() => {
          process.exitCode = 3;
        })
      )
    ),
    Effect.provide(
      inputLayer.pipe(
        Layer.tapError((error) =>
          Effect.andThen(
            Console.error(error.message),
            Effect.sync(() => {
              process.exitCode = error._tag === "InvalidInput" ? 2 : 3;
            })
          )
        )
      )
    )
  ),
  {
    disableErrorReporting: true,
    teardown: (exit, onExit) =>
      Runtime.defaultTeardown(exit, (code) => onExit(process.exitCode === undefined ? code : Number(process.exitCode))),
  }
);
