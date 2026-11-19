import { detectSystemProfile } from "@vidbee/i18n/system-locale";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as P from "effect/Predicate";
import { DEFAULT_DOWNLOAD_MIRROR, parseDownloadMirror } from "./download-mirrors.js";
import { MirrorPreference } from "./MirrorPreference.service.js";
import { HostFailure } from "./Transcription.errors.js";
import { TranscriptionHost } from "./TranscriptionHost.service.js";
export const MirrorPreferenceLive = Layer.effect(
  MirrorPreference,
  Effect.gen(function* () {
    const host = yield* TranscriptionHost;
    return MirrorPreference.of({
      preferChina: Effect.fn("MirrorPreference.preferChina")(function* (input = {}) {
        const snapshot = yield* host.snapshot;
        return yield* Effect.try({
          try: () => {
            const env = input.env ?? snapshot.environment;
            const fromEnv = parseDownloadMirror(env.VIDBEE_DOWNLOAD_MIRROR, DEFAULT_DOWNLOAD_MIRROR);
            if (fromEnv === "cn") return true;
            if (fromEnv === "global") return false;
            const fromSetting = parseDownloadMirror(input.mirror);
            if (fromSetting === "cn") return true;
            if (fromSetting === "global") return false;
            const locales =
              input.locales ??
              (P.isTruthy(input.language) && input.language !== undefined ? [input.language] : undefined);
            return detectSystemProfile({
              countryCode: input.countryCode,
              env,
              locales,
              timeZone: input.timeZone ?? snapshot.timeZone,
              defaultLocale: locales !== undefined && locales.length > 0 ? "" : snapshot.locale,
            }).preferChina;
          },
          catch: (cause) =>
            HostFailure.make({
              operation: "preferChina",
              cause,
              legacyMessage: cause instanceof Error ? cause.message : String(cause),
            }),
        });
      }),
    });
  })
);
