import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Stream from "effect/Stream";
import * as Str from "effect/String";
import * as TestClock from "effect/testing/TestClock";
import { layer as capabilitiesLayer } from "../src/ProcessCapabilities.layer.js";
import { ProcessCapabilities } from "../src/ProcessCapabilities.service.js";
import { pinnedNode } from "./fixtures/pinned-node.js";

let recorded: ChildProcessSpawner.ChildProcessHandle | undefined;
const recordingSpawner = Layer.effect(
  ChildProcessSpawner.ChildProcessSpawner,
  Effect.gen(function* () {
    const original = yield* ChildProcessSpawner.ChildProcessSpawner;
    return ChildProcessSpawner.make(
      Effect.fn("fixture.recordSpawn")(function* (command) {
        const handle = yield* original.spawn(command);
        recorded = handle;
        return handle;
      })
    );
  })
);
const platform = recordingSpawner.pipe(Layer.provideMerge(NodeServices.layer));
const testLayer = capabilitiesLayer.pipe(Layer.provide(requestLayer), Layer.provideMerge(platform));
layer(testLayer)("native unread pipe ownership", (it) => {
  for (const unread of ["stdout", "stderr"] as const) {
    it.effect(
      `an unread ${unread} pipe blocks a large writer until a test-owned reader starts`,
      () =>
        Effect.gen(function* () {
          const node = yield* pinnedNode;
          const service = yield* ProcessCapabilities;
          const scope = yield* Effect.scope;
          const blocked = yield* Deferred.make<void>();
          let markers = "";
          let unreadEvents = 0;
          const other = unread === "stdout" ? "stderr" : "stdout";
          const started = yield* service.start(
            {
              command: node,
              argv: [
                "-e",
                `if(!process.${unread}.write(Buffer.alloc(32*1024*1024,120),()=>process.${other}.write('finished'))){process.${other}.write('blocked')}`,
              ],
              env: undefined,
              extendEnv: false,
              cwd: undefined,
              detached: true,
              windowsHide: true,
              stdin: "ignore",
              stdout: "pipe",
              stderr: "pipe",
              stdoutConsumption: unread === "stdout" ? "unread" : "deliver",
              stderrConsumption: unread === "stderr" ? "unread" : "deliver",
            },
            {
              abort: Effect.void,
              emit: Effect.fn("fixture.output")(function* (event) {
                if (event._tag === unread) unreadEvents += 1;
                if (event._tag === other) {
                  markers += new TextDecoder().decode(event.chunk);
                  if (Str.includes("blocked")(markers)) yield* Deferred.succeed(blocked, undefined);
                }
              }),
            },
            scope
          );
          if (started._tag !== "Acquired") return yield* Effect.die("fixture process did not start");
          yield* Deferred.await(blocked);
          expect(markers).toBe("blocked");
          expect(unreadEvents).toBe(0);
          const handle = recorded;
          if (handle === undefined) return yield* Effect.die("missing recorded handle");
          yield* Stream.runDrain(unread === "stdout" ? handle.stdout : handle.stderr).pipe(Effect.forkScoped);
          const outcome = yield* started.run.awaitReaped;
          expect(outcome).toEqual({ _tag: "Native", result: { _tag: "ExitCode", code: 0 } });
          expect(markers).toBe("blockedfinished");
          expect(unreadEvents).toBe(0);
        }),
      { timeout: 30000 }
    );
  }
  it.effect(
    "ending the one feeder delivers EOF and reaps a real stdin reader",
    () =>
      Effect.gen(function* () {
        const node = yield* pinnedNode;
        const service = yield* ProcessCapabilities;
        const owner = yield* Effect.scope;
        let output = "";
        const started = yield* service.start(
          {
            command: node,
            argv: [
              "-e",
              "let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',()=>process.stdout.write(text+' eof'))",
            ],
            env: undefined,
            extendEnv: false,
            cwd: undefined,
            detached: false,
            windowsHide: true,
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
            stdoutConsumption: "deliver",
            stderrConsumption: "deliver",
          },
          {
            abort: Effect.void,
            emit: (event) =>
              Effect.sync(() => {
                if (event._tag === "stdout") output += new TextDecoder().decode(event.chunk);
              }),
          },
          owner
        );
        if (started._tag !== "Acquired") return yield* Effect.die("fixture did not start");
        yield* started.run.process.writeStdin(new TextEncoder().encode("one"));
        yield* started.run.process.writeStdin(new TextEncoder().encode("two"));
        yield* started.run.endInput;
        const outcome = yield* started.run.awaitReaped;
        expect(outcome).toEqual({ _tag: "Native", result: { _tag: "ExitCode", code: 0 } });
        expect(output).toBe("onetwo eof");
      }),
    { timeout: 30000 }
  );
  it.effect(
    "a TERM-ignoring owned worker is killed after grace and reaped before terminate returns",
    () =>
      Effect.gen(function* () {
        const node = yield* pinnedNode;
        const service = yield* ProcessCapabilities;
        const scope = yield* Effect.scope;
        const ready = yield* Deferred.make<void>();
        const term = yield* Deferred.make<void>();
        const started = yield* service.start(
          {
            command: node,
            argv: [
              "-e",
              "process.on('SIGTERM',()=>process.stderr.write('term'));process.stdout.write('ready');setInterval(()=>{},1000)",
            ],
            env: undefined,
            extendEnv: false,
            cwd: undefined,
            detached: true,
            windowsHide: true,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
            stdoutConsumption: "deliver",
            stderrConsumption: "deliver",
          },
          {
            abort: Effect.void,
            emit: Effect.fn("fixture.terminateOutput")(function* (event) {
              if (event._tag === "stdout") yield* Deferred.succeed(ready, undefined);
              if (event._tag === "stderr") yield* Deferred.succeed(term, undefined);
            }),
          },
          scope
        );
        if (started._tag !== "Acquired") return yield* Effect.die("fixture process did not start");
        yield* Deferred.await(ready);
        let returned = false;
        const stopping = yield* started.run.terminate(100).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              returned = true;
            })
          ),
          Effect.forkScoped
        );
        yield* Deferred.await(term);
        expect(returned).toBe(false);
        const state = yield* started.run.signallingState;
        expect(state).toEqual({ _tag: "Native" });
        yield* TestClock.adjust(100);
        yield* Fiber.join(stopping);
        expect(returned).toBe(true);
        const outcome = yield* started.run.awaitReaped;
        expect(outcome._tag).toBe("Native");
      }),
    { timeout: 30000 }
  );
});
