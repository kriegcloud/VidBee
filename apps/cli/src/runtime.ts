import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as P from "effect/Predicate";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { CliFailure, ParseError } from "./Cli.errors.js";
import { CliConnection } from "./CliConnection.service.js";
import { CliOutput } from "./CliOutput.service.js";
import { CliProbe } from "./CliProbe.service.js";
import { CliProgram } from "./CliProgram.service.js";
import { CliUpgrade } from "./CliUpgrade.service.js";
import { CliVersion } from "./CliVersion.service.js";
import { buildForwardedInput } from "./download/build-input.js";
import { enqueueDownload } from "./download/enqueue.js";
import { ErrorCode } from "./Envelope.model.js";
import { ExitCode, errorEnvelope, exitCodeForError, renderEnvelope } from "./envelope/index.js";
import { parseArgv } from "./parser/index.js";
import { redactArgs, redactText } from "./parser/redact.js";
import { dispatchSubcommand } from "./subcommands/index.js";
import { wireOptionalProperty, wireProperty } from "./transport/automation-client.js";
import { originalMessage } from "./transport/descriptor.js";
import { validateApiUrl } from "./transport/index.js";
import type { AddTaskRequest } from "@vidbee/task-queue/TaskQueue.model";
import type { RunResult } from "./Cli.model.js";
import type { Envelope, ErrorEnvelope } from "./Envelope.model.js";

export type { RunResult } from "./Cli.model.js";

const failure = (cause: unknown) => CliFailure.make({ message: originalMessage(cause), cause });
const attempt = <A>(thunk: () => A) => Effect.try({ try: thunk, catch: failure });
const emit = Effect.fn("emit")(function* (envelope: Envelope, pretty: boolean, exitCode: number) {
  const text = yield* attempt(() => renderEnvelope(envelope, { pretty }));
  yield* (yield* CliOutput).stdout(`${text}\n`);
  return { exitCode, envelope } satisfies RunResult;
});
export const runNative = Effect.fn("runNative")(function* (argv: ReadonlyArray<string>) {
  const parsing = yield* Effect.try({
    try: () => parseArgv(argv),
    catch: (cause) => (S.is(ParseError)(cause) ? cause : failure(cause)),
  }).pipe(Effect.result);
  if (parsing._tag === "Failure") {
    const error = parsing.failure;
    if (!S.is(ParseError)(error)) return yield* error;
    return yield* emit(
      errorEnvelope(S.is(ErrorCode)(error.code) ? error.code : "PARSE_ERROR", error.message),
      false,
      ExitCode.ARG_ERROR
    );
  }
  const parsed = parsing.success;
  const pretty = parsed.flags.pretty;
  if (parsed.flags.api !== undefined) {
    const bad = validateApiUrl(parsed.flags.api);
    if (bad !== null) return yield* emit(bad, pretty, ExitCode.HOST_UNREACHABLE);
  }
  if (parsed.kind === "ytdlp" && parsed.mode === "probe") {
    const result = yield* (yield* CliProbe).run({ argv: parsed.ytArgs });
    if (result.kind === "error") return yield* emit(result.envelope, pretty, exitCodeForError(result.envelope.code));
    const { args } = redactArgs(parsed.ytArgs);
    return yield* emit(
      {
        ok: true,
        mode: "probe",
        command: A.join(["yt-dlp", ...args], " "),
        ytDlp: { exitCode: result.exitCode, stdout: result.stdout, stderr: redactText(result.stderr) },
      },
      pretty,
      result.exitCode === 0 ? 0 : 1
    );
  }
  if (parsed.kind === "subcommand" && (parsed.subcommand === "version" || parsed.subcommand === "upgrade")) {
    const version = yield* (yield* CliVersion).read();
    if (parsed.subcommand === "version")
      return yield* emit({ ok: true, mode: "subcommand", subcommand: "version", result: version }, pretty, 0);
    const options = parseUpgradeArgs(parsed.subArgs);
    if (options.kind === "error") return yield* emit(options.envelope, pretty, 2);
    const upgrade = yield* (yield* CliUpgrade)
      .check({
        current: version.cli,
        ...(options.force ? { force: true } : {}),
        ...(options.cachePath === undefined ? {} : { cachePath: options.cachePath }),
      })
      .pipe(Effect.result);
    if (upgrade._tag === "Failure")
      return yield* emit(
        errorEnvelope("API_UNREACHABLE", upgrade.failure.message, {
          registry: "https://registry.npmjs.org/@vidbee/cli/latest",
        }),
        pretty,
        3
      );
    return yield* emit({ ok: true, mode: "subcommand", subcommand: "upgrade", result: upgrade.success }, pretty, 0);
  }
  const connection = yield* (yield* CliConnection).connect(parsed.flags);
  if (connection.kind === "error")
    return yield* emit(connection.envelope, pretty, exitCodeForError(connection.envelope.code));
  const operation = Effect.gen(function* () {
    if (parsed.kind === "subcommand") {
      const result = yield* dispatchSubcommand(parsed.subcommand, parsed.subArgs, { client: connection.client });
      if (result.kind === "error") return yield* emit(result.envelope, pretty, exitCodeForError(result.envelope.code));
      return yield* emit(
        { ok: true, mode: "subcommand", subcommand: parsed.subcommand, result: result.value },
        pretty,
        0
      );
    }
    const built = yield* attempt(() => buildForwardedInput({ argv: parsed.ytArgs, flags: parsed.flags }));
    const request: AddTaskRequest = { input: built.input };
    if (P.isTruthy(parsed.flags.priority))
      request.priority = parsed.flags.priority === "user" ? 0 : parsed.flags.priority === "subscription" ? 10 : 20;
    if (parsed.flags.groupKey !== undefined) request.groupKey = parsed.flags.groupKey;
    if (parsed.flags.maxAttempts !== undefined) request.maxAttempts = parsed.flags.maxAttempts;
    const result = yield* enqueueDownload({ client: connection.client, request, wait: parsed.flags.wait });
    const task = result.task;
    if (result.kind === "detached") {
      const projection = yield* attempt(() => ({
        id: wireProperty(task, "id"),
        status: wireProperty(task, "status"),
        attempt: wireProperty(task, "attempt"),
        maxAttempts: wireProperty(task, "maxAttempts"),
        command: built.commandPreview,
      }));
      return yield* emit({ ok: true, mode: "download", task: projection }, pretty, 0);
    }
    if (result.kind === "wait-success")
      return yield* emit(
        { ok: true, mode: "download", task, ytDlp: { exitCode: 0, stdoutTail: "", stderrTail: "" } },
        pretty,
        0
      );
    const stderrTail = yield* attempt(() => wireOptionalProperty(wireProperty(task, "lastError"), "stderrTail") ?? "");
    const tail = yield* S.decodeUnknownEffect(S.String)(stderrTail).pipe(Effect.mapError(failure));
    return yield* emit(
      { ok: false, mode: "download", task, ytDlp: { exitCode: 1, stdoutTail: "", stderrTail: redactText(tail) } },
      pretty,
      1
    );
  });
  return yield* operation.pipe(
    Effect.catch((error) => emit(errorEnvelope("UNKNOWN_ERROR", error.message), pretty, 2)),
    Effect.ensuring(connection.shutdown)
  );
});
interface UpgradeArgs {
  cachePath?: string;
  force: boolean;
  readonly kind: "ok";
}
function parseUpgradeArgs(
  args: ReadonlyArray<string>
): UpgradeArgs | { readonly kind: "error"; readonly envelope: ErrorEnvelope } {
  const out: UpgradeArgs = { kind: "ok", force: false };
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === "--force") {
      out.force = true;
      continue;
    }
    if (token === "--cache") {
      const next = args[i + 1];
      if (next === undefined)
        return { kind: "error", envelope: errorEnvelope("MISSING_VALUE", "--cache requires a path") };
      out.cachePath = next;
      i++;
      continue;
    }
    if (Str.startsWith("--cache=")(token)) {
      out.cachePath = Str.slice("--cache=".length)(token);
      continue;
    }
    return { kind: "error", envelope: errorEnvelope("PARSE_ERROR", `unknown :upgrade flag: ${token}`) };
  }
  return out;
}
export const run = Effect.fn("run")(function* (argv: ReadonlyArray<string>) {
  return yield* (yield* CliProgram).run(argv);
});
