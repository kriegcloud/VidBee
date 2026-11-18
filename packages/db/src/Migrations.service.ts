import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { DbMigrationError } from "./Db.errors.js";
export class DbSchema extends Context.Service<
  DbSchema,
  {
    readonly applyTaskQueue: Effect.Effect<void, DbMigrationError>;
    readonly applySubscriptions: Effect.Effect<void, DbMigrationError>;
    readonly applyTranscripts: Effect.Effect<void, DbMigrationError>;
    readonly applyPromptRuns: Effect.Effect<void, DbMigrationError>;
  }
>()("@vidbee/db/Migrations.service/DbSchema") {}
