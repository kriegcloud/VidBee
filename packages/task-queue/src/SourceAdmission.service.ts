import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
export type Release = Effect.Effect<void>;
export interface AdmissionState {
  readonly acquire: (url: string) => Effect.Effect<Release>;
  readonly subscribe: (listener: Effect.Effect<void>) => Effect.Effect<() => void>;
  readonly tryAcquire: (url: string) => Effect.Effect<Option.Option<Release>>;
}
export class SourceAdmission extends Context.Service<SourceAdmission, AdmissionState>()(
  "@vidbee/task-queue/SourceAdmission.service/SourceAdmission"
) {}
