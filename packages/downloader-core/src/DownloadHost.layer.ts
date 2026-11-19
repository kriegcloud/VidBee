import * as Layer from "effect/Layer";
import { DownloadHost } from "./DownloadHost.service.js";
import type * as Context from "effect/Context";

/** Host entrypoints supply live synchronous capabilities, including environment writes. */
export const downloadHostLayer = (capabilities: Context.Service.Shape<typeof DownloadHost>) =>
  Layer.succeed(DownloadHost, capabilities);
