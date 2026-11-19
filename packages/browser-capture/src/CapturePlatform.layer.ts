import { layer as DownloadProcessLive } from "@vidbee/downloader-core/Process.driver";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import * as Layer from "effect/Layer";
import { CaptureFilesLive } from "./CaptureFiles.layer.js";
import { NativeCaptureHostDriver } from "./CaptureHost.driver.js";
import { CaptureHostLive } from "./CaptureHost.layer.js";
import { CaptureTimersLive } from "./CaptureTimers.driver.js";
import { RecorderLive } from "./Recorder.layer.js";
import { VirtualDisplayLive } from "./VirtualDisplay.layer.js";
import type { NativeHostCapabilities } from "./CaptureHost.driver.js";
/** Entrypoints supply live host identity; all native process and timer work belongs to this layer. */
export const CapturePlatformLive = (capabilities: NativeHostCapabilities) => {
  const host = CaptureHostLive.pipe(Layer.provide(NativeCaptureHostDriver(capabilities)));
  const process = DownloadProcessLive.pipe(Layer.provide(requestLayer));
  const dependencies = Layer.mergeAll(host, process, CaptureFilesLive, CaptureTimersLive, LegacyTiming.layer);
  return Layer.mergeAll(RecorderLive, VirtualDisplayLive).pipe(Layer.provideMerge(dependencies));
};
