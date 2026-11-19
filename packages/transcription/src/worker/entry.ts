/** Native worker composition. Application consumers still select the compatibility entrypoint. */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { layer as capabilitiesLayer } from "@vidbee/downloader-core/ProcessCapabilities.layer";
import { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import { requestLayer } from "@vidbee/task-queue/ProcessControl.driver";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { AtomicFilesLive } from "../AtomicFiles.layer.js";
import { layer as audioLayer } from "../Audio.layer.js";
import { AudioAbortLive } from "../AudioAbort.driver.js";
import { CheckpointsLive } from "../Checkpoints.layer.js";
import { ModelFileIOLive } from "../ModelFileIO.layer.js";
import { ModelFilesLive } from "../ModelFiles.layer.js";
import { ModelHttpLive } from "../ModelHttp.layer.js";
import { ModelsHooks } from "../Models.service.js";
import { SeedFilesLive } from "../SeedFiles.layer.js";
import { SherpaLive, SherpaNativeLoader } from "../Sherpa.driver.js";
import { TranscriptionFilesLive } from "../TranscriptionFiles.layer.js";
import { TranscriptionHostPrimitivesLive } from "../TranscriptionHost.driver.js";
import { TranscriptionHostLive } from "../TranscriptionHost.layer.js";
import { TranscriptionIdsLive } from "../TranscriptionIds.layer.js";
import { layer as processLayer } from "../TranscriptionProcess.layer.js";
import { TranscriptionTimeLive } from "../TranscriptionTime.layer.js";
import { binaryLayer, layer as waveLayer } from "../WaveReader.layer.js";
import { WorkerHandlerLive } from "../WorkerHandler.layer.js";
import { WorkerLoopLive } from "../WorkerLoop.layer.js";
import { WorkerLoop } from "../WorkerLoop.service.js";
import { WorkerOutputLive } from "../WorkerOutput.layer.js";
import { WorkerProtocolLive, WorkerResultJsonLive } from "../WorkerProtocol.layer.js";
import { WorkerSessionFactoryLive } from "../WorkerSessionFactory.layer.js";

const platform = NodeServices.layer;
const files = TranscriptionFilesLive.pipe(Layer.provideMerge(platform));
const time = TranscriptionTimeLive;
const ids = TranscriptionIdsLive.pipe(Layer.provide(SecureRandom.layerWebCrypto));
const host = TranscriptionHostLive.pipe(Layer.provideMerge(files), Layer.provide(TranscriptionHostPrimitivesLive));
const foundation = Layer.mergeAll(host, time, ids, LegacyTiming.layer);
const atomic = AtomicFilesLive.pipe(Layer.provideMerge(foundation));
const checkpoints = CheckpointsLive.pipe(Layer.provideMerge(atomic));
const processes = processLayer.pipe(
  Layer.provide(capabilitiesLayer),
  Layer.provide(requestLayer),
  Layer.provide(platform)
);
const waves = waveLayer.pipe(Layer.provide(binaryLayer), Layer.provide(files));
const audio = audioLayer.pipe(
  Layer.provideMerge(checkpoints),
  Layer.provideMerge(processes),
  Layer.provide(waves),
  Layer.provide(AudioAbortLive)
);
const io = ModelFileIOLive.pipe(Layer.provideMerge(processes), Layer.provide(platform));
const http = ModelHttpLive.pipe(Layer.provide(FetchHttpClient.layer));
const modelFiles = ModelFilesLive.pipe(Layer.provideMerge(foundation), Layer.provideMerge(io));
const hooks = Layer.succeed(ModelsHooks, {
  makeAbortController: () => new AbortController(),
  preferChina: Effect.succeed(false),
});
const sherpa = SherpaLive.pipe(Layer.provide(SherpaNativeLoader), Layer.provide(time));
const dependencies = Layer.mergeAll(audio, modelFiles, http, hooks, sherpa);
const factory = WorkerSessionFactoryLive.pipe(Layer.provideMerge(dependencies));
const seeds = SeedFilesLive.pipe(Layer.provideMerge(atomic));
const protocol = WorkerProtocolLive.pipe(Layer.provide(files), Layer.provide(WorkerResultJsonLive));
const output = WorkerOutputLive.pipe(Layer.provide(platform));
const handler = WorkerHandlerLive.pipe(
  Layer.provideMerge(factory),
  Layer.provideMerge(seeds),
  Layer.provideMerge(output)
);
const loop = WorkerLoopLive.pipe(
  Layer.provide(handler),
  Layer.provide(output),
  Layer.provide(protocol),
  Layer.provide(platform)
);
const abort = new AbortController();
process.on("SIGTERM", () => abort.abort());
process.on("SIGINT", () => abort.abort());
const runtime = ManagedRuntime.make(loop);
runtime.runCallback(
  WorkerLoop.use((service) => service.run(abort.signal, () => abort.abort())),
  {
    onExit: (exit) => {
      runtime.runCallback(runtime.disposeEffect, { onExit: () => process.exit(exit._tag === "Success" ? 0 : 1) });
    },
  }
);
