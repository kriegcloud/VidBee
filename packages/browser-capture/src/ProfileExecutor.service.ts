import * as Context from "effect/Context";
import type { TaskExecutor } from "@vidbee/task-queue/TaskExecutor.service";
import type * as Effect from "effect/Effect";
import type { BrowserProfiles } from "./BrowserProfiles.service.js";
import type { CaptureError, HostFailure } from "./Capture.errors.js";
export class ProfileExecutorDependencies extends Context.Service<
  ProfileExecutorDependencies,
  {
    readonly attempt: (
      effect: Effect.Effect<void, CaptureError>
    ) => Effect.Effect<{ readonly wait: Effect.Effect<void, CaptureError> }>;
    readonly matches: (url: string) => Effect.Effect<boolean, HostFailure>;
    readonly name: () => string;
    readonly defaultDirectory: Effect.Effect<string, HostFailure>;
    readonly download: typeof BrowserProfiles.Service.download;
    readonly fallback: typeof TaskExecutor.Service;
  }
>()("@vidbee/browser-capture/ProfileExecutor.service/ProfileExecutorDependencies") {}
export class ProfileExecutorOptions extends Context.Service<
  ProfileExecutorOptions,
  {
    readonly adapter: import("./onlyfans-profile.js").BrowserProfileAdapter;
    readonly defaultDirectory: Effect.Effect<string, HostFailure>;
    readonly fallback: typeof TaskExecutor.Service;
  }
>()("@vidbee/browser-capture/ProfileExecutor.service/ProfileExecutorOptions") {}
