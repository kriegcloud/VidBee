import { expect, layer } from "@effect/vitest";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { requestLayer, requestLayerForPlatform } from "../src/ProcessControl.driver.js";
import { ProcessRequests } from "../src/ProcessControl.service.js";
import type * as ChildProcess from "effect/process/ChildProcess";

const commands: Array<ChildProcess.Command> = [];
const base = ChildProcessSpawner.make(Effect.fn("fixture.unusedSpawn")(() => Effect.never));
const spawner = Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, {
  ...base,
  exitCode: Effect.fn("fixture.nonwaitingControl")((command: ChildProcess.Command) =>
    Effect.suspend(() => {
      commands.push(command);
      return Effect.never;
    })
  ),
});
layer(requestLayer.pipe(Layer.provide(spawner)))("non-waiting process requests", (it) => {
  it.effect("acknowledges PID and group controls while their commands remain pending", () =>
    Effect.gen(function* () {
      const requests = yield* ProcessRequests;
      commands.length = 0;
      yield* requests.pid(42, "SIGTERM");
      yield* requests.group(43, "SIGKILL");
      yield* requests.tree(44, "SIGTERM");
      yield* requests.pid(0, "SIGKILL");
      expect(commands).toHaveLength(3);
      const first = commands[0];
      const second = commands[1];
      if (first?._tag === "StandardCommand" && second?._tag === "StandardCommand") {
        expect(first.command).toBe(process.platform === "win32" ? "taskkill" : "kill");
        if (process.platform !== "win32") {
          expect(first.args).toEqual(["-TERM", "--", "42"]);
          expect(second.args).toEqual(["-KILL", "--", "-43"]);
        } else {
          expect(first.args).toEqual(["/PID", "42", "/F"]);
        }
      }
    })
  );
});

const completedCommands: Array<ChildProcess.Command> = [];
const finishingSpawner = Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, {
  ...base,
  exitCode: Effect.fn("fixture.completingControl")((command: ChildProcess.Command) =>
    Effect.sync(() => {
      completedCommands.push(command);
      return ChildProcessSpawner.ExitCode(command._tag === "StandardCommand" && command.args[2] === "-42" ? 1 : 0);
    })
  ),
});
for (const platform of ["linux", "win32"]) {
  layer(requestLayerForPlatform(platform).pipe(Layer.provide(finishingSpawner)))(
    `request control argv ${platform}`,
    (it) => {
      it.effect("preserves PID, group and tree target semantics without waiting", () =>
        Effect.gen(function* () {
          const requests = yield* ProcessRequests;
          completedCommands.length = 0;
          yield* requests.pid(42, "SIGTERM");
          yield* requests.tree(42, "SIGKILL");
          const argv = A.map(completedCommands, (command) => (command._tag === "StandardCommand" ? command.args : []));
          if (platform === "win32")
            expect(argv).toEqual([
              ["/PID", "42", "/F"],
              ["/PID", "42", "/T", "/F"],
            ]);
          else
            expect(argv).toEqual([
              ["-TERM", "--", "42"],
              ["-KILL", "--", "-42"],
              ["-KILL", "--", "42"],
            ]);
        })
      );
    }
  );
}
