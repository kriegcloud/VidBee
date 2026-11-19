import { expect, it, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { DownloadHost } from "../src/DownloadHost.service.js";
import { DownloadProcess } from "../src/DownloadProcess.service.js";
import { DownloadTiming } from "../src/DownloadTiming.service.js";
import {
  galleryItems,
  parseGalleryJsonMessage,
  runGalleryJson,
  toCategorySummary,
} from "../src/InstagramScan.service.js";
import type { ProcessSink } from "../src/DownloadProcess.service.js";
import type { GalleryJsonResult } from "../src/InstagramScan.model.js";
import type { ProcessSpec } from "../src/Process.model.js";

const emptyResult = (): GalleryJsonResult => ({
  exitCode: null,
  stderr: "",
  directoryMetadata: [],
  sourceIds: HashSet.empty(),
  assetCount: 0,
  parseError: false,
  items: HashMap.empty(),
  itemOrder: [],
});

it("preserves source-ID conversion, item insertion order and duplicate asset accumulation", () => {
  const result = emptyResult();
  parseGalleryJsonMessage([2, { id: 123, vidbee_cursor: "cursor" }], result);
  parseGalleryJsonMessage(
    [3, "signed", { post_url: "https://instagram.com/p/second/?token=removed", media_id: 2, post_id: 123 }],
    result
  );
  parseGalleryJsonMessage(
    [3, "signed", { post_url: "https://instagram.com/p/first/", media_id: "1", post_id: "first" }],
    result
  );
  parseGalleryJsonMessage(
    [3, "signed", { post_url: "https://instagram.com/p/second/", media_id: 3, post_id: 123 }],
    result
  );
  expect(galleryItems(result)).toEqual([
    {
      id: "https://instagram.com/p/second/",
      url: "https://instagram.com/p/second/",
      assetCount: 2,
      assetIds: ["2", "3"],
      sourceVersion: undefined,
      title: undefined,
    },
    {
      id: "https://instagram.com/p/first/",
      url: "https://instagram.com/p/first/",
      assetCount: 1,
      assetIds: ["1"],
      sourceVersion: undefined,
      title: undefined,
    },
  ]);
  expect(HashSet.size(result.sourceIds)).toBe(2);
  result.exitCode = 0;
  expect(toCategorySummary("posts", result)).toEqual({
    category: "posts",
    state: "ready",
    sourceCount: 2,
    assetCount: 3,
  });
  parseGalleryJsonMessage([9, {}], result);
  expect(result.parseError).toBe(false);
  parseGalleryJsonMessage(null, result);
  expect(result.parseError).toBe(true);
});

let started: Deferred.Deferred<ProcessSink> | undefined;
const specs: ProcessSpec[] = [];
const requests: string[] = [];
const processLayer = Layer.effect(
  DownloadProcess,
  Effect.gen(function* () {
    const launch = yield* Deferred.make<ProcessSink>();
    started = launch;
    return DownloadProcess.of({
      start: Effect.fn("scanFixture.start")(function* (spec, sink) {
        specs.push(spec);
        yield* Deferred.succeed(launch, sink);
        return {
          _tag: "Acquired",
          run: {
            pid: 123,
            writeStdin: (_bytes: Uint8Array) => Effect.void,
            observeClose: Effect.void,
            signalChild: (signal) =>
              Effect.sync(() => {
                requests.push(`child:${signal}`);
              }),
            signalPid: (signal) =>
              Effect.sync(() => {
                requests.push(`pid:${signal}`);
              }),
            signalGroup: (signal) =>
              Effect.sync(() => {
                requests.push(`group:${signal}`);
              }),
            signalTree: (signal) =>
              Effect.sync(() => {
                requests.push(`tree:${signal}`);
              }),
          },
        };
      }),
    });
  })
);
const hostLayer = Layer.succeed(DownloadHost, {
  platform: () => "linux",
  homeDirectory: () => "/fixture",
  tempDirectory: () => "/fixture",
  environment: () => ({}),
  setEnvironment: Effect.fn("scanFixture.setEnvironment")(() => Effect.void),
  makeAbortController: () => new AbortController(),
  uuid: () => "fixture",
});
const timingLayer = Layer.succeed(DownloadTiming, {
  turn: Effect.fn("scanFixture.turn")(() => Effect.void),
  sleep: Effect.fn("scanFixture.sleep")(() => Effect.never),
});

layer(Layer.mergeAll(processLayer, hostLayer, timingLayer))((it) => {
  it.effect("delivers synchronous checkpoints and replaces them with the final full document", () =>
    Effect.gen(function* () {
      if (started === undefined) return yield* Effect.die("process fixture was not initialized");
      const checkpoints: string[] = [];
      const fiber = yield* Effect.forkChild(
        runGalleryJson(
          "fixture-gallery",
          "https://instagram.com/example/posts/",
          ["--cookie", "file"],
          true,
          undefined,
          (result) =>
            Effect.sync(() => {
              checkpoints.push(result.cursor ?? "");
            })
        ),
        { startImmediately: true }
      );
      const sink = yield* Deferred.await(started);
      const checkpointJson = yield* S.encodeEffect(S.fromJsonString(S.Unknown))([
        2,
        { vidbee_cursor: "checkpoint", id: "checkpoint-only" },
      ]);
      yield* sink.emit({ _tag: "stderr", chunk: new TextEncoder().encode(`VIDBEE_MAP:${checkpointJson}\n`) });
      expect(checkpoints).toEqual(["checkpoint"]);
      const document = yield* S.encodeEffect(S.fromJsonString(S.Unknown))([
        [2, { id: "final", username: "example" }],
        [
          3,
          "signed",
          {
            post_url: "https://instagram.com/p/final/",
            media_id: "1",
            post_id: "final",
            description: "split UTF-8: é",
          },
        ],
      ]);
      const bytes = new TextEncoder().encode(document);
      const split = bytes.indexOf(0xc3) + 1;
      expect(split).toBeGreaterThan(0);
      yield* sink.emit({ _tag: "stdout", chunk: bytes.subarray(0, split) });
      yield* sink.emit({ _tag: "stdout", chunk: bytes.subarray(split) });
      yield* sink.emit({ _tag: "complete", outcome: { _tag: "Raw", code: 0, signal: null, killed: false } });
      const result = yield* Fiber.join(fiber);
      expect(result.parseError).toBe(false);
      expect(HashSet.has(result.sourceIds, "checkpoint-only")).toBe(false);
      expect(HashSet.has(result.sourceIds, "final")).toBe(true);
      expect(galleryItems(result)[0]?.title).toBe("split UTF-8: é");
      expect(result.itemOrder).toEqual(["https://instagram.com/p/final/"]);
      expect(specs[0]?.argv).toContain("6.0-12.0");
      expect(specs[0]?.detached).toBe(true);
      expect(requests).toEqual([]);
    })
  );
});
