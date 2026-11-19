import * as Context from "effect/Context";
import * as S from "effect/Schema";

export const RegistryCounts = S.Record(S.String, S.Finite);
export type RegistryCounts = typeof RegistryCounts.Type;
/** Optional diagnostics for observing ownership without exposing mutable registries. */
export class RegistryInspection extends Context.Service<
  RegistryInspection,
  { readonly register: (owner: string, snapshot: () => RegistryCounts) => void }
>()("@vidbee/task-queue/RegistryInspection.service/RegistryInspection") {}
