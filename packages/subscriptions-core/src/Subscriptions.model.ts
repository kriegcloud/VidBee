import { LiteralKit } from "@vidbee/schema/LiteralKit";
import { TaskCreationMetadata } from "@vidbee/task-queue/Task.model";
import * as S from "effect/Schema";
import { InterpretedFeedItem, StoredSubscriptionRule } from "./Feed.model.js";
export const EnqueueTrigger = LiteralKit(["auto", "manual"]);
export type EnqueueTrigger = typeof EnqueueTrigger.Type;
export const ChangedEventKind = LiteralKit(["changed"]);
export type ChangedEventKind = typeof ChangedEventKind.Type;
export const ChangedEvent = S.Struct({ kind: ChangedEventKind });
export type ChangedEvent = typeof ChangedEvent.Type;
export const StoredEnqueueItemContext = S.Struct({
  creation: TaskCreationMetadata.pipe(S.optional, S.mutableKey),
  subscription: StoredSubscriptionRule.pipe(S.mutableKey),
  item: InterpretedFeedItem.pipe(S.mutableKey),
  trigger: EnqueueTrigger.pipe(S.mutableKey),
  batch: S.Struct({ id: S.String.pipe(S.mutableKey), title: S.String.pipe(S.mutableKey) }).pipe(
    S.optional,
    S.mutableKey
  ),
});
export type StoredEnqueueItemContext = typeof StoredEnqueueItemContext.Type;
