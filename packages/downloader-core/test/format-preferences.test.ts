import { expect, it } from "@effect/vitest";
import { buildAudioFormatPreference, buildVideoFormatPreference } from "../src/format-preferences.js";

it.each([
  {
    preset: "best" as const,
    video: "bestvideo+bestaudio[abr<=320]/bestvideo+bestaudio/best",
    audio: "bestaudio[abr<=320]/bestaudio/best",
  },
  {
    preset: "good" as const,
    video:
      "bestvideo[height<=1080]+bestaudio[abr<=256]/bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio[abr<=256]/bestvideo+bestaudio/best",
    audio: "bestaudio[abr<=256]/bestaudio/best",
  },
  {
    preset: "normal" as const,
    video:
      "bestvideo[height<=720]+bestaudio[abr<=192]/bestvideo[height<=720]+bestaudio/bestvideo+bestaudio[abr<=192]/bestvideo+bestaudio/best",
    audio: "bestaudio[abr<=192]/bestaudio/best",
  },
  {
    preset: "bad" as const,
    video:
      "bestvideo[height<=480]+bestaudio[abr<=128]/bestvideo[height<=480]+bestaudio/bestvideo+bestaudio[abr<=128]/bestvideo+bestaudio/best",
    audio: "bestaudio[abr<=128]/bestaudio/best",
  },
  { preset: "worst" as const, video: "worstvideo+worstaudio/worst/best", audio: "worstaudio/bestaudio/best" },
])("retains the complete $preset selectors and ordering", ({ preset, video, audio }) => {
  expect(buildVideoFormatPreference({ oneClickQuality: preset })).toBe(video);
  expect(buildAudioFormatPreference({ oneClickQuality: preset })).toBe(audio);
});
it("treats the best preset's null height as an absent limit", () => {
  expect(buildVideoFormatPreference({})).toBe("bestvideo+bestaudio[abr<=320]/bestvideo+bestaudio/best");
});
