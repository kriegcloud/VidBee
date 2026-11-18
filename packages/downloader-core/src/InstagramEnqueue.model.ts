import { TaskPriority } from "@vidbee/task-queue/Task.model";
import * as S from "effect/Schema";
import {
  InstagramProfileCategory,
  InstagramProfileDownloadInput,
  InstagramProfileInspection,
} from "./Download.model.js";
export const InspectionCacheEntry = S.Struct({
  inspection: InstagramProfileInspection,
  categoryUrls: S.Record(InstagramProfileCategory, S.String),
});
export type InspectionCacheEntry = typeof InspectionCacheEntry.Type;
export const InstagramEnqueueInput = S.Struct({
  input: InstagramProfileDownloadInput,
  defaultDownloadDir: S.String,
  batch: S.Struct({ id: S.String, title: S.String }).pipe(S.optional),
  priority: TaskPriority.pipe(S.optional),
});
export type InstagramEnqueueInput = typeof InstagramEnqueueInput.Type;
export const InstagramTaskIdentityJson = S.Union([S.String, S.Finite]).pipe(S.Array, S.fromJsonString);
