import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ProbeOptions, ProbeResult } from "./Probe.model.js";
export class CliProbe extends Context.Service<
  CliProbe,
  { readonly run: (options: ProbeOptions) => Effect.Effect<ProbeResult> }
>()("@vidbee/cli/CliProbe.service/CliProbe") {}
