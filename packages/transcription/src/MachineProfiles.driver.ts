import { cpus, totalmem } from "node:os";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { MachinePrimitives } from "./MachineProfiles.service.js";
import { HostFailure } from "./Transcription.errors.js";

const attempt = <A>(operation: string, read: () => A) =>
  Effect.try({
    try: read,
    catch: (cause) =>
      HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) }),
  });
export const MachinePrimitivesLive = Layer.succeed(MachinePrimitives, {
  platform: Effect.sync(() => process.platform),
  arch: Effect.sync(() => process.arch),
  ramBytes: attempt("totalmem", () => totalmem()),
  cpuCount: attempt("cpus", () => cpus().length),
  cpuModel: attempt("cpuModel", () => cpus()[0]?.model),
});
