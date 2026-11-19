import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HostFailure } from "./Downloader.errors.js";
import { DownloadProcess } from "./DownloadProcess.service.js";
import { layer as downloadLayer } from "./Process.driver.js";
import { ProcessCapabilities } from "./ProcessCapabilities.service.js";

/** Owner/validation adapter only: acquisition, input and observations share DownloadProcess. */
export const adapterLayer = Layer.effect(
  ProcessCapabilities,
  Effect.gen(function* () {
    const process = yield* DownloadProcess;
    return ProcessCapabilities.of({
      start: Effect.fn("ProcessCapabilities.start")(function* (spec, sink, owner) {
        if (
          (spec.stdoutConsumption === "unread" && spec.stdout !== "pipe") ||
          (spec.stderrConsumption === "unread" && spec.stderr !== "pipe")
        ) {
          return yield* HostFailure.make({ operation: "start", legacyMessage: "unread requires a piped output" });
        }
        const started = yield* process.start({ ...spec, extendedLifecycle: true }, sink, owner);
        if (started._tag !== "Acquired") return started;
        const lifecycle = started.run.lifecycle;
        if (lifecycle === undefined) {
          return yield* HostFailure.make({ operation: "start", legacyMessage: "Process lifecycle is unavailable" });
        }
        return { _tag: "Acquired" as const, run: { process: started.run, ...lifecycle } };
      }),
    });
  })
);
export const layer = adapterLayer.pipe(Layer.provide(downloadLayer));
