import { expect, it } from "@effect/vitest";
import { drizzle as oldDrizzle } from "drizzle-orm-rollback-fixture/better-sqlite3";
import { migrate as oldMigrate } from "drizzle-orm-rollback-fixture/better-sqlite3/migrator";
import * as A from "effect/Array";
import * as Str from "effect/String";
import { readJournal, readText } from "./legacy/io.js";
import { desktopMigrations, migrationsFolder, open, snapshot } from "./support.js";

for (const count of [0, 1, 2, 3])
  for (const direction of ["new-old-new", "old-new-old"]) {
    it(`${direction}: ${count} already applied SQL migrations preserve rows and timestamps`, (t) => {
      const db = open();
      t.onTestFinished(db.close);
      const journal = readJournal();
      for (const entry of journal.entries.slice(0, count))
        db.exec(A.join(Str.split(readText(`${migrationsFolder}/${entry.tag}.sql`), "--> statement-breakpoint"), "\n"));
      desktopMigrations().reconcileLegacyMigrationState(db.raw);
      const previous = oldDrizzle(db.raw);
      const old = () =>
        oldMigrate(previous, {
          migrationsFolder,
        });
      const forward = () => desktopMigrations().runMigrations(db.db);
      if (direction === "new-old-new") {
        forward();
        old();
        forward();
      } else {
        old();
        forward();
        old();
      }
      expect(db.all("SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at")).toEqual(
        snapshot("migration-rows")
      );
      expect(db.all("PRAGMA integrity_check")).toEqual([
        {
          integrity_check: "ok",
        },
      ]);
    });
  }
