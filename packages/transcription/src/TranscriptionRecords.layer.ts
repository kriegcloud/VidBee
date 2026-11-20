import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { TranscriptionRecords } from "./TranscriptionRecords.service.js";
import { TranscriptStore } from "./TranscriptStore.service.js";
export const layer = Layer.effect(
  TranscriptionRecords,
  Effect.map(TranscriptStore, (store) => ({
    latest: store.getLatestForDownload,
    list: store.listForDownload,
    commit: store.commit,
    activate: store.activate,
  }))
);
