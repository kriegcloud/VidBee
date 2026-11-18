import { expect, it } from "@effect/vitest";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as R from "effect/Record";
import * as S from "effect/Schema";
import * as History from "../src/History.model.js";
import { decodeRow } from "../src/Row.js";
import { snapshot } from "./support.js";

it.effect(
  "download_history: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-download_history") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("download_history")(History.DownloadHistoryRowFromSql)(row.raw);
        const property = yield* decodeRow("download_history")(History.DownloadHistoryRow)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(History.DownloadHistoryInsert)(insert);
      }
    })
);

import * as TaskQueue from "../src/TaskQueue.model.js";

it.effect("tasks: raw and property models preserve pinned values and accept omitted nullable insert columns", () =>
  Effect.gen(function* () {
    const rows = snapshot("roundtrip-tasks") as ReadonlyArray<{
      raw: Record<string, unknown>;
      drizzle: Record<string, unknown>;
    }>;
    for (const row of rows) {
      const raw = yield* decodeRow("tasks")(TaskQueue.TaskRowFromSql)(row.raw);
      const property = yield* decodeRow("tasks")(TaskQueue.TaskRow)(row.drizzle);
      expect({
        ...raw,
      }).toEqual(row.drizzle);
      expect({
        ...property,
      }).toEqual(row.drizzle);
      const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
      yield* S.decodeUnknownEffect(TaskQueue.TaskInsert)(insert);
    }
  })
);
it.effect("attempts: raw and property models preserve pinned values and accept omitted nullable insert columns", () =>
  Effect.gen(function* () {
    const rows = snapshot("roundtrip-attempts") as ReadonlyArray<{
      raw: Record<string, unknown>;
      drizzle: Record<string, unknown>;
    }>;
    for (const row of rows) {
      const raw = yield* decodeRow("attempts")(TaskQueue.AttemptRowDbFromSql)(row.raw);
      const property = yield* decodeRow("attempts")(TaskQueue.AttemptRowDb)(row.drizzle);
      expect({
        ...raw,
      }).toEqual(row.drizzle);
      expect({
        ...property,
      }).toEqual(row.drizzle);
      const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
      yield* S.decodeUnknownEffect(TaskQueue.AttemptInsert)(insert);
    }
  })
);
it.effect(
  "process_journal: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-process_journal") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("process_journal")(TaskQueue.ProcessJournalRowDbFromSql)(row.raw);
        const property = yield* decodeRow("process_journal")(TaskQueue.ProcessJournalRowDb)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(TaskQueue.ProcessJournalInsert)(insert);
      }
    })
);
it.effect(
  "schema_meta: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-schema_meta") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("schema_meta")(TaskQueue.SchemaMetaRowFromSql)(row.raw);
        const property = yield* decodeRow("schema_meta")(TaskQueue.SchemaMetaRow)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(TaskQueue.SchemaMetaInsert)(insert);
      }
    })
);

import * as Subscriptions from "../src/Subscriptions.model.js";

it.effect(
  "subscriptions: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-subscriptions") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("subscriptions")(Subscriptions.SubscriptionRowFromSql)(row.raw);
        const property = yield* decodeRow("subscriptions")(Subscriptions.SubscriptionRow)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(Subscriptions.SubscriptionInsert)(insert);
      }
    })
);
it.effect(
  "subscription_items: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-subscription_items") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("subscription_items")(Subscriptions.SubscriptionItemRowFromSql)(row.raw);
        const property = yield* decodeRow("subscription_items")(Subscriptions.SubscriptionItemRow)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(Subscriptions.SubscriptionItemInsert)(insert);
      }
    })
);
it.effect(
  "subscriptions_meta: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-subscriptions_meta") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("subscriptions_meta")(Subscriptions.SubscriptionsMetaRowFromSql)(row.raw);
        const property = yield* decodeRow("subscriptions_meta")(Subscriptions.SubscriptionsMetaRow)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(Subscriptions.SubscriptionsMetaInsert)(insert);
      }
    })
);

import * as Transcripts from "../src/Transcripts.model.js";

it.effect(
  "transcripts: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-transcripts") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("transcripts")(Transcripts.TranscriptRowFromSql)(row.raw);
        const property = yield* decodeRow("transcripts")(Transcripts.TranscriptRow)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(Transcripts.TranscriptInsert)(insert);
      }
    })
);
it.effect(
  "transcript_speakers: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-transcript_speakers") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("transcript_speakers")(Transcripts.TranscriptSpeakerRowFromSql)(row.raw);
        const property = yield* decodeRow("transcript_speakers")(Transcripts.TranscriptSpeakerRow)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(Transcripts.TranscriptSpeakerInsert)(insert);
      }
    })
);
it.effect(
  "transcript_segments: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-transcript_segments") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("transcript_segments")(Transcripts.TranscriptSegmentRowFromSql)(row.raw);
        const property = yield* decodeRow("transcript_segments")(Transcripts.TranscriptSegmentRow)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(Transcripts.TranscriptSegmentInsert)(insert);
      }
    })
);

import * as PromptRuns from "../src/PromptRuns.model.js";

it.effect(
  "transcript_prompt_runs: raw and property models preserve pinned values and accept omitted nullable insert columns",
  () =>
    Effect.gen(function* () {
      const rows = snapshot("roundtrip-transcript_prompt_runs") as ReadonlyArray<{
        raw: Record<string, unknown>;
        drizzle: Record<string, unknown>;
      }>;
      for (const row of rows) {
        const raw = yield* decodeRow("transcript_prompt_runs")(PromptRuns.TranscriptPromptRunRowFromSql)(row.raw);
        const property = yield* decodeRow("transcript_prompt_runs")(PromptRuns.TranscriptPromptRunRow)(row.drizzle);
        expect({
          ...raw,
        }).toEqual(row.drizzle);
        expect({
          ...property,
        }).toEqual(row.drizzle);
        const insert = R.fromEntries(A.filter(R.toEntries(row.drizzle), ([, value]) => value !== null));
        yield* S.decodeUnknownEffect(PromptRuns.TranscriptPromptRunInsert)(insert);
      }
    })
);
