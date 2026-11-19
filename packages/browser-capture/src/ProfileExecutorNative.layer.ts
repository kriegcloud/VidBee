import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { BrowserProfiles } from "./BrowserProfiles.service.js";
import { HostFailure } from "./Capture.errors.js";
import { ProfileExecutorDependencies, ProfileExecutorOptions } from "./ProfileExecutor.service.js";
import type { CaptureError } from "./Capture.errors.js";

const makeDependencies = Effect.fn("makeProfileExecutorDependencies")(function* () {
  const profiles = yield* BrowserProfiles;
  const options = yield* ProfileExecutorOptions;
  const scope = yield* Effect.scope;
  return ProfileExecutorDependencies.of({
    name: () => options.adapter.name,
    matches: Effect.fn("ProfileExecutorDependencies.matches")((url) =>
      Effect.try({
        try: () => options.adapter.isSite(url),
        catch: (cause) =>
          HostFailure.make({
            operation: "profile route",
            cause,
            legacyMessage: cause instanceof Error ? cause.message : String(cause),
          }),
      })
    ),
    defaultDirectory: options.defaultDirectory,
    download: profiles.download,
    fallback: options.fallback,
    attempt: Effect.fn("ProfileExecutor.attempt")(function* (effect) {
      const done = yield* Deferred.make<void, CaptureError>();
      yield* Effect.forkIn(effect.pipe(Effect.onExit((exit) => Deferred.done(done, exit).pipe(Effect.asVoid))), scope);
      return { wait: Deferred.await(done) };
    }),
  });
});
export const ProfileExecutorNativeDependencies = Layer.effect(ProfileExecutorDependencies)(makeDependencies());
