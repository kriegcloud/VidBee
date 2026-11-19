import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ProfileHost } from "./BrowserProfiles.service.js";
import { HostFailure } from "./Capture.errors.js";

const aborted = (signal: AbortSignal) =>
  Effect.callback<never, HostFailure>((resume) => {
    const stop = () =>
      resume(
        Effect.fail(
          HostFailure.make({
            operation: "profile delay",
            cause: signal.reason,
            legacyMessage: "Capture cancelled",
          })
        )
      );
    signal.addEventListener("abort", stop, {
      once: true,
    });
    if (signal.aborted) stop();
    return Effect.sync(() => signal.removeEventListener("abort", stop));
  });
/** Native callers supply their output-directory capability explicitly. */
export const profileHostLayer = (defaultDirectory: Effect.Effect<string, HostFailure>) =>
  Layer.succeed(ProfileHost, {
    defaultDirectory,
    delay: Effect.fn("ProfileHost.delay")((ms: number, signal: AbortSignal) =>
      signal.aborted
        ? Effect.fail(
            HostFailure.make({
              operation: "profile delay",
              cause: signal.reason,
              legacyMessage: "Capture cancelled",
            })
          )
        : aborted(signal).pipe(Effect.timeoutOrElse({ duration: ms, orElse: () => Effect.void }))
    ),
  });
