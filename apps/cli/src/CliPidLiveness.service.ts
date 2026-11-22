import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
export class CliPidLiveness extends Context.Service<
  CliPidLiveness,
  { readonly isAlive: (pid: number) => Effect.Effect<boolean> }
>()("@vidbee/cli/CliPidLiveness.service/CliPidLiveness") {}
