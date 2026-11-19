import * as os from "node:os";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as S from "effect/Schema";
import { BoundaryDecodeError } from "./Capture.errors.js";
import { CaptureLive } from "./Capture.layer.js";
import { CapturePlatformLive } from "./CapturePlatform.layer.js";
import { PlaybackLive } from "./Playback.layer.js";
import { PlaywrightLive } from "./Playwright.driver.js";
import { BrowserCallbacks } from "./Playwright.service.js";
import { encodeSidecarEvent } from "./protocol.js";
import { SidecarJson } from "./Sidecar.service.js";
import { runSidecar } from "./SidecarProgram.js";
import type { LegacyTiming } from "@vidbee/task-queue/LegacyTiming.service";
import type { Capture } from "./Capture.service.js";
import type { CaptureFiles } from "./CaptureFiles.service.js";
import type { CaptureHost } from "./CaptureHost.service.js";
import type { SidecarEvent } from "./Protocol.model.js";

const abort = new AbortController();
const stop = () => abort.abort();
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
const snapshot = () => ({
  platform: process.platform,
  home: os.homedir(),
  temp: os.tmpdir(),
  execPath: process.execPath,
  pid: process.pid,
  environment: { ...process.env },
});
const platform = CapturePlatformLive({ snapshot, makeAbortController: () => new AbortController() });
let runtime: ManagedRuntime.ManagedRuntime<Capture | CaptureFiles | CaptureHost | LegacyTiming | SidecarJson, never>;
const callbacks = Layer.succeed(BrowserCallbacks, {
  sync: (effect) => {
    runtime.runSync(effect);
  },
  promise: (effect) => runtime.runPromise(effect),
});
const browser = PlaywrightLive.pipe(Layer.provideMerge(Layer.merge(platform, callbacks)));
const playback = PlaybackLive.pipe(Layer.provideMerge(browser));
const capture = CaptureLive.pipe(Layer.provideMerge(playback));
const json = Layer.succeed(SidecarJson, {
  parse: Effect.fn("SidecarJson.parse")((text) =>
    S.decodeUnknownEffect(S.fromJsonString(S.Unknown))(text).pipe(
      Effect.mapError((cause) =>
        BoundaryDecodeError.make({ operation: "sidecar.json", legacyMessage: "Invalid browser-capture data.", cause })
      )
    )
  ),
});
runtime = ManagedRuntime.make(Layer.merge(capture, json).pipe(Layer.provideMerge(NodeServices.layer)));
const emit = Effect.fn("sidecar.emit")((event: SidecarEvent) =>
  Effect.fromResult(encodeSidecarEvent(event)).pipe(
    Effect.flatMap((line) =>
      Effect.sync(() => {
        process.stdout.write(`${line}\n`);
      })
    )
  )
);
runtime.runFork(
  runSidecar(process.argv, abort.signal, { emit }).pipe(
    Effect.catch((error) =>
      emit({ message: error.legacyMessage, type: "error" }).pipe(
        Effect.andThen(
          Effect.sync(() => {
            process.exitCode = 1;
          })
        )
      )
    )
  )
);
