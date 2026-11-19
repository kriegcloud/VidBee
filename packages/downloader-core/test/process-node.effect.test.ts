import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import * as A from "effect/Array";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Str from "effect/String";
import { DownloadProcess } from "../src/DownloadProcess.service.js";
import { layer as processLayer } from "../src/Process.driver.js";
import { pinnedNode } from "./fixtures/pinned-node.js";
import type { ProcessEvent, ProcessOutcome } from "../src/Process.model.js";

const testLayer = processLayer.pipe(Layer.provide(requestLayer), Layer.provideMerge(NodeServices.layer));
layer(testLayer)("stock Node spawner observations", (it) => {
  for (const exitCode of [0, 7]) {
    it.effect(`fake pinned Node child drains both outputs and exits ${exitCode}`, () =>
      Effect.gen(function* () {
        const node = yield* pinnedNode;
        expect(node).toMatch(/^\//);

        const service = yield* DownloadProcess;
        const completed = yield* Deferred.make<ProcessOutcome>();
        const events: ProcessEvent[] = [];
        const started = yield* service.start(
          {
            command: node,
            argv: [
              "-e",
              `process.stdout.write('fixture stdout'); process.stderr.write('fixture stderr'); process.exitCode = ${exitCode}`,
            ],
            env: undefined,
            extendEnv: false,
            cwd: undefined,
            detached: true,
            windowsHide: true,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
          },
          {
            abort: Effect.void,
            emit: Effect.fn("fixture.nodeEvent")(function* (event) {
              events.push(event);
              if (event._tag === "complete") yield* Deferred.succeed(completed, event.outcome);
            }),
          }
        );
        expect(started._tag).toBe("Acquired");
        const outcome = yield* Deferred.await(completed);
        expect(outcome).toEqual({ _tag: "Native", result: { _tag: "ExitCode", code: exitCode } });
        expect(events).toEqual(
          expect.arrayContaining([
            { _tag: "nativeExit", result: { _tag: "ExitCode", code: exitCode } },
            { _tag: "stdoutEnd" },
            { _tag: "stderrEnd" },
          ])
        );
        let stdout = "";
        let stderr = "";
        for (const event of events) {
          if (event._tag === "stdout") stdout += new TextDecoder().decode(event.chunk);
          if (event._tag === "stderr") stderr += new TextDecoder().decode(event.chunk);
          expect(event._tag).not.toBe("rawError");
          expect(event._tag).not.toBe("rawExit");
        }
        expect(stdout).toBe("fixture stdout");
        expect(stderr).toBe("fixture stderr");
        expect(events[events.length - 1]?._tag).toBe("complete");
      })
    );
  }
  it.effect("leader exit keeps descendant-held output open until a group request reaches it", () =>
    Effect.gen(function* () {
      const node = yield* pinnedNode;
      const service = yield* DownloadProcess;
      const childReady = yield* Deferred.make<void>();
      const leaderExited = yield* Deferred.make<void>();
      const completed = yield* Deferred.make<ProcessOutcome>();
      const observed: string[] = [];
      const source =
        "const cp=require('node:child_process');cp.spawn(process.execPath,['-e',\"process.stdout.write('descendant-ready'+String.fromCharCode(10));setInterval(()=>{},1000)\"],{stdio:['ignore','inherit','inherit']}).unref();process.exit(0)";
      const started = yield* service.start(
        {
          command: node,
          argv: ["-e", source],
          env: undefined,
          extendEnv: false,
          cwd: undefined,
          detached: true,
          windowsHide: true,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          abort: Effect.void,
          emit: Effect.fn("fixture.descendantEvent")(function* (event) {
            observed.push(
              event._tag === "stdout" || event._tag === "stderr"
                ? `${event._tag}: ${new TextDecoder().decode(event.chunk)}`
                : event._tag
            );
            if (event._tag === "stdout" && Str.includes("descendant-ready")(new TextDecoder().decode(event.chunk)))
              yield* Deferred.succeed(childReady, undefined);
            if (event._tag === "nativeExit") yield* Deferred.succeed(leaderExited, undefined);
            if (event._tag === "complete") {
              yield* Deferred.succeed(completed, event.outcome);
              yield* Deferred.succeed(childReady, undefined);
              yield* Deferred.succeed(leaderExited, undefined);
            }
          }),
        }
      );
      if (started._tag !== "Acquired") return yield* Effect.die(started.error);
      yield* Deferred.await(childReady);
      yield* Deferred.await(leaderExited);
      expect(observed).toContain("stdout: descendant-ready\n");
      const before = yield* Deferred.isDone(completed);
      expect(before).toBe(false);
      yield* started.run.signalChild("SIGTERM");
      yield* started.run.signalPid("SIGKILL");
      const afterPid = yield* Deferred.isDone(completed);
      expect(afterPid).toBe(false);
      yield* started.run.signalGroup("SIGKILL");
      const outcome = yield* Deferred.await(completed);
      expect(outcome).toEqual({ _tag: "Native", result: { _tag: "ExitCode", code: 0 } });
    })
  );
  it.effect("stock nonzero leader cleanup terminates descendant-held pipes without a site request", () =>
    Effect.gen(function* () {
      const node = yield* pinnedNode;
      const service = yield* DownloadProcess;
      const completed = yield* Deferred.make<ProcessOutcome>();
      const events: ProcessEvent[] = [];
      const source =
        "const cp=require('node:child_process');const child=cp.spawn(process.execPath,['-e',\"process.stdout.write('descendant-ready'+String.fromCharCode(10));process.send('ready');setInterval(()=>{},1000)\"],{stdio:['ignore','inherit','inherit','ipc']});child.on('message',()=>process.exit(7));child.unref()";
      const started = yield* service.start(
        {
          command: node,
          argv: ["-e", source],
          env: undefined,
          extendEnv: false,
          cwd: undefined,
          detached: true,
          windowsHide: true,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          abort: Effect.void,
          emit: Effect.fn("fixture.nonzeroDescendantEvent")(function* (event) {
            events.push(event);
            if (event._tag === "complete") yield* Deferred.succeed(completed, event.outcome);
          }),
        }
      );
      expect(started._tag).toBe("Acquired");
      const outcome = yield* Deferred.await(completed);
      expect(outcome).toEqual({ _tag: "Native", result: { _tag: "ExitCode", code: 7 } });
      expect(events).toEqual(expect.arrayContaining([{ _tag: "stdoutEnd" }, { _tag: "stderrEnd" }]));
      expect(
        A.some(
          events,
          (event) => event._tag === "stdout" && Str.includes("descendant-ready")(new TextDecoder().decode(event.chunk))
        )
      ).toBe(true);
    })
  );
});
