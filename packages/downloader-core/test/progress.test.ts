import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import { YtDlpProgressPayload } from "../src/YtDlpProgress.model.js";
import {
  DownloadProgressAggregator,
  parseEtaMs,
  parseSize,
  parseYtDlpProgressPayload,
} from "../src/yt-dlp-progress.js";

describe("native progress calculations", () => {
  it.effect(
    "keeps wrapper false positives out of task progress",
    Effect.fn(function* () {
      const decoded = yield* S.decodeEffect(YtDlpProgressPayload)({
        percent: 50,
        totalSize: "16MiB",
        eta: "01:02",
      });
      expect(parseYtDlpProgressPayload(decoded)).toEqual({
        percent: 0.5,
        bytesDownloaded: 8 * 1024 * 1024,
        bytesTotal: 16 * 1024 * 1024,
        speedBps: null,
        etaMs: 62000,
      });
      expect(parseYtDlpProgressPayload({ percent: Number.NaN }).percent).toBeNull();
      expect(parseYtDlpProgressPayload({ percent: Number.POSITIVE_INFINITY }).percent).toBeNull();
    })
  );

  it.effect(
    "ignores sidecar percent and accounts for the next media stream",
    Effect.fn(function* () {
      const payload = yield* S.decodeEffect(YtDlpProgressPayload)({ percent: 100, totalSize: "16MiB" });
      const aggregator = new DownloadProgressAggregator();
      expect(aggregator.apply(payload)?.percent).toBe(1);
      const sidecar = aggregator.apply({ percent: 5, totalSize: "1KiB" });
      expect(sidecar?.percent).toBe(1);
      const audio = aggregator.apply({ percent: 0, totalSize: "4MiB" });
      expect(audio?.percent).toBe(0.8);
      expect(audio?.bytesDownloaded).toBe(16 * 1024 * 1024);
      expect(audio?.bytesTotal).toBe(20 * 1024 * 1024);
      expect(audio?.ticks).toBe(3);
    })
  );

  it.effect(
    "keeps token parsing permissive and bad tokens absent",
    Effect.fn(function* () {
      yield* Effect.void;
      expect(parseSize("~1.5MiB")).toBe(1572864);
      expect(parseSize("Unknown")).toBeNull();
      expect(parseEtaMs("1:02:03")).toBe(3723000);
      expect(parseEtaMs("Unknown")).toBeNull();
      expect(parseEtaMs("1:bad")).toBeNull();
    })
  );
});
