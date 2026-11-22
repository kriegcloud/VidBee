import * as Layer from "effect/Layer";
import { CliDescriptor } from "./CliDescriptor.service.js";
import { readDescriptor, resolveDescriptorPath } from "./transport/descriptor.js";
export const CliDescriptorLive = Layer.effect(
  CliDescriptor,
  Effect.gen(function* () {
    const context = yield* Effect.context<DownloadFiles | CliHost | Path.Path>();
    return CliDescriptor.of({
      read: Effect.fn("CliDescriptor.read")((options) => readDescriptor(options).pipe(Effect.provide(context))),
      path: Effect.fn("CliDescriptor.path")((options) => resolveDescriptorPath(options).pipe(Effect.provide(context))),
    });
  })
);

import * as Effect from "effect/Effect";
import type { DownloadFiles } from "@vidbee/downloader-core/DownloadFiles.service";
import type * as Path from "effect/Path";
import type { CliHost } from "./CliHost.service.js";
