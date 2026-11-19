import { expect, it } from "@effect/vitest";
import { asrLanguageForFamily } from "../../src/asr-recognizer.js";
import { DEFAULT_ASR_TIER, parseAsrTier } from "../../src/asr-tiers.js";
import { captionsTaskId } from "../../src/captions.js";
import { DEFAULT_DOWNLOAD_MIRROR, parseDownloadMirror } from "../../src/download-mirrors.js";
import { DEFAULT_SPEAKER_COUNT, parseSpeakerCount } from "../../src/speaker-count.js";

it("explicit native parser arguments distinguish data from fallback in both forms", () => {
  expect(parseAsrTier("balanced", DEFAULT_ASR_TIER)).toBe("balanced");
  expect(parseAsrTier("balanced")("invalid")).toBe("balanced");
  expect(parseDownloadMirror("global", DEFAULT_DOWNLOAD_MIRROR)).toBe("global");
  expect(parseDownloadMirror("global")("invalid")).toBe("global");
  expect(parseSpeakerCount(2, DEFAULT_SPEAKER_COUNT)).toBe(2);
  expect(parseSpeakerCount(2)("invalid")).toBe(2);
  expect(asrLanguageForFamily(undefined, undefined)).toBe("");
  expect(asrLanguageForFamily("en")("whisper")).toBe("");
  expect(captionsTaskId("download", undefined)).toBe("captions:download");
  expect(captionsTaskId("en")("download")).toBe("captions:download:en");
});
