import * as DrizzleSqlite from "drizzle-orm/effect-sqlite-node";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
export class Drizzle extends Context.Service<Drizzle, DrizzleSqlite.EffectSQLiteNodeDatabase>()(
  "@vidbee/db/Drizzle.service/Drizzle"
) {}
export const layer = Layer.effect(Drizzle, DrizzleSqlite.makeWithDefaults());
