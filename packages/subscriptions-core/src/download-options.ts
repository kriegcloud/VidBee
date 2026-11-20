import { buildAudioFormatPreference, buildVideoFormatPreference } from "@vidbee/downloader-core/format-preferences";
import { dual } from "effect/Function";
import type { SubscriptionDownloadDefaults, SubscriptionDownloadOptions } from "./Subscription.model.js";
import type { SubscriptionDownloadPreferences } from "./types.js";

/** Resolve subscription overrides into executor options for automatic and manual downloads. */
const downloadOptions = (
  subscription: SubscriptionDownloadPreferences,
  defaults: SubscriptionDownloadDefaults
): SubscriptionDownloadOptions => {
  const type = subscription.downloadType ?? defaults.oneClickDownloadType ?? "video";
  if (type === "subtitles") {
    return { type, format: "srt" };
  }
  const settings = {
    oneClickQuality: subscription.downloadQuality ?? defaults.oneClickQuality ?? "best",
  };
  if (type === "audio") {
    return { type, format: buildAudioFormatPreference(settings) };
  }
  return {
    type,
    format: buildVideoFormatPreference(settings),
    containerFormat: subscription.downloadContainer ?? defaults.oneClickContainer ?? "auto",
  };
};

export const buildSubscriptionDownloadOptions: {
  (
    subscription: SubscriptionDownloadPreferences,
    defaults: SubscriptionDownloadDefaults
  ): ReturnType<typeof downloadOptions>;
  (
    defaults: SubscriptionDownloadDefaults
  ): (subscription: SubscriptionDownloadPreferences) => ReturnType<typeof downloadOptions>;
} = dual(2, downloadOptions);
