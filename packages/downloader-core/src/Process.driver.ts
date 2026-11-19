import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DownloadProcess } from "./DownloadProcess.service.js";
import { makeNativeServices } from "./ProcessCapabilities.layer.js";

/** Settled downloader API backed by the shared process acquisition implementation. */
export const layer = Layer.effect(
  DownloadProcess,
  makeNativeServices().pipe(Effect.map((services) => services.download))
);
export { layer as capabilitiesLayer } from "./ProcessCapabilities.layer.js";
