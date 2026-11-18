import { dual } from "effect/Function";

export * from "../subscriptions.js";

import { SUBSCRIPTIONS_DDL_V1, SUBSCRIPTIONS_DDL_V2, SUBSCRIPTIONS_V3_COLUMNS } from "../subscriptions.js";

/**
 * Apply subscription DDL and additive column migrations. `columns` is the
 * current `PRAGMA table_info(subscriptions)` name list (empty when the table
 * does not exist yet). Idempotent.
 *
 * @param exec SQLite exec callback used by the host.
 * @param columns Existing `subscriptions` column names.
 */
const apply = (exec: (sql: string) => void, columns: string[]): void => {
  exec(SUBSCRIPTIONS_DDL_V1);
  if (!columns.includes("auto_download")) {
    exec(SUBSCRIPTIONS_DDL_V2);
  }
  // Nullable overrides preserve the global defaults for existing subscriptions.
  for (const column of ["download_type", "download_quality", "download_container"]) {
    if (!columns.includes(column)) {
      exec(`ALTER TABLE subscriptions ADD COLUMN ${column} TEXT;`);
    }
  }
  // V3: profile subscriptions. Existing rows are RSS feeds on the default interval.
  for (const [column, definition] of SUBSCRIPTIONS_V3_COLUMNS) {
    if (!columns.includes(column)) {
      exec(`ALTER TABLE subscriptions ADD COLUMN ${column} ${definition};`);
    }
  }
};

export const applySubscriptionsMigrations: {
  (exec: (sql: string) => void, columns: string[]): void;
  (columns: string[]): (exec: (sql: string) => void) => void;
} = dual(2, apply);

// Preserve the mutable structural legacy types for unported consumers.
import type * as Tables from "../subscriptions.js";
export type SubscriptionRow = typeof Tables.subscriptionsTable.$inferSelect;
export type SubscriptionInsert = typeof Tables.subscriptionsTable.$inferInsert;
export type SubscriptionItemRow = typeof Tables.subscriptionItemsTable.$inferSelect;
export type SubscriptionItemInsert = typeof Tables.subscriptionItemsTable.$inferInsert;
export type SubscriptionsMetaRow = typeof Tables.subscriptionsMetaTable.$inferSelect;
export type SubscriptionsMetaInsert = typeof Tables.subscriptionsMetaTable.$inferInsert;
