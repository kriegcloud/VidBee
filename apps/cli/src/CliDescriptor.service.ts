import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { ReadDescriptorResult, ResolveDescriptorOptions } from "./Descriptor.model.js";
export class CliDescriptor extends Context.Service<
  CliDescriptor,
  {
    readonly path: (options?: ResolveDescriptorOptions) => Effect.Effect<string>;
    readonly read: (options?: ResolveDescriptorOptions) => Effect.Effect<ReadDescriptorResult>;
  }
>()("@vidbee/cli/CliDescriptor.service/CliDescriptor") {}
