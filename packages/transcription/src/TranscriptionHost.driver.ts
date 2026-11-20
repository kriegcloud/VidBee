import { createRequire } from "node:module";
import { cpus, setPriority, tmpdir, totalmem } from "node:os";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HostFailure } from "./Transcription.errors.js";
import { TranscriptionHostPrimitives } from "./TranscriptionHost.service.js";

const require = createRequire(import.meta.url);
const attempt = <A>(operation: string, body: () => A) =>
  Effect.try({
    try: body,
    catch: (cause) =>
      HostFailure.make({ operation, cause, legacyMessage: cause instanceof Error ? cause.message : String(cause) }),
  });
export const TranscriptionHostPrimitivesLive = Layer.succeed(TranscriptionHostPrimitives, {
  snapshot: attempt("snapshot", () => {
    const options = Intl.DateTimeFormat().resolvedOptions();
    return {
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      execPath: process.execPath,
      cwd: process.cwd(),
      temporaryDirectory: tmpdir(),
      resourceDirectories: [],
      environment: { ...process.env },
      cpuModel: cpus()[0]?.model ?? "",
      cpuCount: Math.max(1, cpus().length),
      ramBytes: totalmem(),
      locale: options.locale,
      timeZone: options.timeZone,
    };
  }),
  resolveModule: Effect.fn("TranscriptionHostPrimitives.resolveModule")((id) =>
    attempt("resolveModule", () => require.resolve(id))
  ),
  lowerPriority: Effect.fn("TranscriptionHostPrimitives.lowerPriority")((pid) =>
    attempt("lowerPriority", () => {
      try {
        setPriority(pid, 10);
      } catch {
        /* Best-effort priority matches the compatibility host. */
      }
    })
  ),
  isProcessAlive: Effect.fn("TranscriptionHostPrimitives.isProcessAlive")((pid) =>
    Effect.sync(() => {
      if (!Number.isInteger(pid) || pid <= 0) return false;
      try {
        process.kill(pid, 0);
        return true;
      } catch (cause) {
        return !(cause !== null && typeof cause === "object" && "code" in cause && cause.code === "ESRCH");
      }
    })
  ),
});
