import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
export class OutputProbe extends Context.Service<
  OutputProbe,
  { readonly filePresent: (path: string) => Effect.Effect<boolean> }
>()("@vidbee/task-queue/OutputProbe.service/OutputProbe") {}
