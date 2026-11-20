import { DownloadProcess } from "@vidbee/downloader-core/DownloadProcess.service";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliProbe } from "./CliProbe.service.js";
import { CliProbeProcess } from "./CliProbeProcess.service.js";
import { runProbeNative } from "./download/probe.js";
import type { CliHost } from "./CliHost.service.js";
export const CliProbeProcessLive = Layer.effect(
  CliProbeProcess,
  Effect.map(DownloadProcess, (process) => CliProbeProcess.of({ start: process.start }))
);
export const CliProbeLive = Layer.effect(
  CliProbe,
  Effect.gen(function* () {
    const dependencies = yield* Effect.context<CliProbeProcess | CliHost>();
    return CliProbe.of({
      run: Effect.fn("CliProbe.run")((options) => runProbeNative(options).pipe(Effect.provide(dependencies))),
    });
  })
);
