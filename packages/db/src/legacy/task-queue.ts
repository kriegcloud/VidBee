export * from "../task-queue.js";

// Preserve the mutable structural legacy types for unported consumers.
import type * as Tables from "../task-queue.js";
export type TaskRow = typeof Tables.tasksTable.$inferSelect;
export type TaskInsert = typeof Tables.tasksTable.$inferInsert;
export type AttemptRowDb = typeof Tables.attemptsTable.$inferSelect;
export type AttemptInsert = typeof Tables.attemptsTable.$inferInsert;
export type ProcessJournalRowDb = typeof Tables.processJournalTable.$inferSelect;
export type ProcessJournalInsert = typeof Tables.processJournalTable.$inferInsert;
