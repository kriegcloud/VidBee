import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import { ClockTickRate, LinuxProcessIdentity, ProcessOutputText, ProcessProbeNumber } from "./ProcessControl.model.js";
import { ProcessControl, ProcessRequests } from "./ProcessControl.service.js";

/** Native process probes. Windows start identity stays unverified, matching the legacy default. */
export const layer = Layer.effect(
  ProcessControl,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const platform = process.platform;
    let cachedHz: number | null | undefined;
    const tickRate = Effect.gen(function* () {
      if (cachedHz !== undefined) return cachedHz;
      const text = yield* spawner
        .string(ChildProcess.make("getconf", ["CLK_TCK"]))
        .pipe(Effect.orElseSucceed(() => ""));
      const decoded = S.decodeOption(ProcessOutputText)(text);
      const parsed = Option.isSome(decoded)
        ? S.decodeOption(ClockTickRate)(Number.parseInt(Str.trim(decoded.value), 10))
        : Option.none();
      cachedHz = Option.getOrNull(parsed);
      return cachedHz;
    });
    const startTime = Effect.fn("ProcessControl.startTime")(
      function* (pid: number) {
        if (platform === "linux") {
          const path = `/proc/${pid}/stat`;
          if (!(yield* fs.exists(path))) return null;
          const raw = yield* fs.readFileString(path).pipe(Effect.flatMap(S.decodeEffect(ProcessOutputText)));
          const lastParen = Str.lastIndexOf(")")(raw);
          if (Option.isNone(lastParen)) return null;
          const fields = Str.split(Str.slice(lastParen.value + 2)(raw), " ");
          const ticks = Number.parseInt(fields[19] ?? "", 10);
          if (!Number.isFinite(ticks)) return null;
          const stat = yield* fs.readFileString("/proc/stat").pipe(Effect.flatMap(S.decodeEffect(ProcessOutputText)));
          const boot = /^btime\s+(\d+)/m.exec(stat);
          if (boot === null) return null;
          const identity = S.decodeOption(LinuxProcessIdentity)({
            bootTimeSeconds: Number.parseInt(boot[1] ?? "", 10),
            starttimeTicks: ticks,
          });
          if (Option.isNone(identity)) return null;
          const hz = (yield* tickRate) ?? 100;
          return Option.getOrNull(
            S.decodeOption(ProcessProbeNumber)(
              (identity.value.bootTimeSeconds + identity.value.starttimeTicks / hz) * 1000
            )
          );
        }
        if (platform === "darwin") {
          const raw = yield* spawner.string(ChildProcess.make("ps", ["-o", "lstart=", "-p", String(pid)]));
          const decoded = S.decodeOption(ProcessOutputText)(raw);
          if (Option.isNone(decoded)) return null;
          const parsed = DateTime.make(Str.trim(decoded.value));
          return Option.isSome(parsed) ? DateTime.toEpochMillis(parsed.value) : null;
        }
        return null;
      },
      Effect.orElseSucceed(() => null)
    );
    return ProcessControl.of({
      startTime,
      isAlive: Effect.fn("ProcessControl.isAlive")(
        function* (pid) {
          if (platform === "linux") return yield* fs.exists(`/proc/${pid}`);
          // ps observes a PID without requiring permission to send it a signal.
          // On Windows tasklist's PID filter gives the corresponding process-list probe.
          const raw =
            platform === "win32"
              ? yield* spawner.string(ChildProcess.make("tasklist", ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"]))
              : yield* spawner.string(ChildProcess.make("ps", ["-p", String(pid), "-o", "pid="]));
          const decoded = S.decodeOption(ProcessOutputText)(raw);
          if (Option.isNone(decoded)) return false;
          if (platform === "win32") return Str.includes(`"${pid}"`)(decoded.value);
          const observed = S.decodeOption(ProcessProbeNumber)(Number.parseInt(Str.trim(decoded.value), 10));
          return Option.isSome(observed) && observed.value === pid;
        },
        Effect.orElseSucceed(() => false)
      ),
      kill: Effect.fn("ProcessControl.kill")(function* (pid, signal) {
        if (pid <= 0) return;
        if (platform === "win32") {
          yield* spawner.exitCode(ChildProcess.make("taskkill", ["/PID", String(pid), "/T", "/F"])).pipe(Effect.ignore);
          return;
        }
        const group = yield* spawner
          .exitCode(ChildProcess.make("kill", [`-${Str.slice(3)(signal)}`, "--", String(-pid)]))
          .pipe(Effect.orElseSucceed(() => -1));
        if (group !== 0)
          yield* spawner
            .exitCode(ChildProcess.make("kill", [`-${Str.slice(3)(signal)}`, "--", String(pid)]))
            .pipe(Effect.ignore);
      }),
    });
  })
);

/** Request fibers belong to the providing layer; acknowledgement never awaits termination. */
export const requestLayerForPlatform = (platform: string) =>
  Layer.effect(
    ProcessRequests,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const scope = yield* Effect.scope;
      const command = (pid: number, signal: "SIGTERM" | "SIGKILL", group: boolean, tree: boolean) =>
        platform === "win32"
          ? ChildProcess.make("taskkill", ["/PID", String(pid), ...(tree ? ["/T"] : []), "/F"])
          : ChildProcess.make("kill", [`-${Str.slice(3)(signal)}`, "--", String(group ? -pid : pid)]);
      const request = Effect.fn("ProcessRequests.request")(function* (
        pid: number,
        signal: "SIGTERM" | "SIGKILL",
        target: "pid" | "group" | "tree"
      ) {
        if (pid <= 0) return;
        const action =
          target === "tree" && platform !== "win32"
            ? spawner.exitCode(command(pid, signal, true, true)).pipe(
                Effect.orElseSucceed(() => -1),
                Effect.flatMap((code) =>
                  code === 0 ? Effect.void : spawner.exitCode(command(pid, signal, false, false)).pipe(Effect.ignore)
                )
              )
            : spawner.exitCode(command(pid, signal, target === "group", target === "tree")).pipe(Effect.ignore);
        yield* Effect.forkIn(Effect.scoped(action), scope, { startImmediately: true });
      });
      return ProcessRequests.of({
        pid: Effect.fn("ProcessRequests.pid")((pid, signal) => request(pid, signal, "pid")),
        group: Effect.fn("ProcessRequests.group")((pid, signal) => request(pid, signal, "group")),
        tree: Effect.fn("ProcessRequests.tree")((pid, signal) => request(pid, signal, "tree")),
      });
    })
  );

export const requestLayer = requestLayerForPlatform(process.platform);
