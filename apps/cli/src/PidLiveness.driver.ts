import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliPidLiveness } from "./CliPidLiveness.service.js";
/** Exact signal-zero probe; every thrown result means dead, as before. */
export const CliPidLivenessLive = Layer.succeed(CliPidLiveness, {
  isAlive: Effect.fn("CliPidLiveness.isAlive")((pid) =>
    Effect.try({
      try: () => {
        process.kill(pid, 0);
        return true;
      },
      catch: () => false,
    }).pipe(Effect.orElseSucceed(() => false))
  ),
});
