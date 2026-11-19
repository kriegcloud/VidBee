import { expect, layer } from "@effect/vitest";
import { BetterSqliteClient, DbRowDecodeError, DbSchema, Migrations } from "@vidbee/db";
import Database from "better-sqlite3";
import * as Arr from "effect/Array";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Reactivity from "effect/reactivity/Reactivity";
import * as Scheduler from "effect/Scheduler";
import * as S from "effect/Schema";
import * as Str from "effect/String";
import * as SqlClient from "effect/sql/SqlClient";
import * as Statement from "effect/sql/Statement";
import { testDriver } from "../../db/test/legacy/io.js";
import { nodeLayer } from "../../db/test/legacy/subscription-client.js";
import * as F from "../src/Feed.model.js";
import * as R from "../src/Rows.model.js";
import { SubscriptionEntropy } from "../src/SubscriptionEntropy.service.js";
import { SubscriptionMetaMemoryLive, SubscriptionMetaSqlLive } from "../src/SubscriptionMeta.layer.js";
import { SubscriptionMeta } from "../src/SubscriptionMeta.service.js";
import { SubscriptionStoreSqlLive } from "../src/SubscriptionStore.layer.js";
import { SubscriptionStore } from "../src/SubscriptionStore.service.js";
import { SubscriptionTimers } from "../src/SubscriptionTimers.service.js";
import type * as Connection from "effect/sql/SqlConnection";

const driver = testDriver;
class SqlTrace extends Context.Service<
  SqlTrace,
  {
    readonly statements: Effect.Effect<string[]>;
    readonly clear: Effect.Effect<void>;
    readonly execute: (statement: string) => Effect.Effect<void>;
    readonly inTransaction: Effect.Effect<boolean>;
    readonly safeIntegers: Effect.Effect<void>;
  }
>()("@vidbee/subscriptions-core/test/native-persistence.test/SqlTrace") {}
const borrowed = Layer.unwrap(
  Effect.acquireRelease(
    Effect.sync(() => {
      const statements: string[] = [];
      const handle = new Database(":memory:", { verbose: (statement) => statements.push(String(statement)) });
      return { handle, statements };
    }),
    ({ handle }) =>
      Effect.sync(() => {
        handle.close();
      })
  ).pipe(
    Effect.map(({ handle, statements }) =>
      Layer.merge(
        BetterSqliteClient.layerFromHandle(handle),
        Layer.succeed(SqlTrace, {
          statements: Effect.sync(() => [...statements]),
          clear: Effect.sync(() => {
            statements.length = 0;
          }),
          execute: Effect.fn((statement) =>
            Effect.sync(() => {
              handle.exec(statement);
            })
          ),
          inTransaction: Effect.sync(() => handle.inTransaction),
          safeIntegers: Effect.sync(() => {
            handle.defaultSafeIntegers(true);
          }),
        })
      )
    )
  )
);
const traceEmpty = Layer.succeed(SqlTrace, {
  statements: Effect.succeed([]),
  clear: Effect.void,
  execute: Effect.fn(() => Effect.void),
  inTransaction: Effect.succeed(false),
  safeIntegers: Effect.void,
});
const client = driver === "node" ? Layer.merge(nodeLayer(":memory:"), traceEmpty) : borrowed;
const host = Layer.merge(
  Layer.succeed(SubscriptionTimers, {
    now: Effect.succeed(1000),
    after: Effect.fn("SubscriptionTimers.after")(() => Effect.succeed(Effect.void)),
    every: Effect.fn("SubscriptionTimers.every")(() => Effect.succeed(Effect.void)),
  }),
  Layer.effect(
    SubscriptionEntropy,
    Effect.sync(() => {
      let n = 0;
      return SubscriptionEntropy.of({
        subscriptionId: Effect.sync(() => `subscription-${++n}`),
        leaseId: Effect.succeed("lease"),
        next: Effect.succeed(0.5),
      });
    })
  )
);
const services = Layer.mergeAll(SubscriptionStoreSqlLive, SubscriptionMetaSqlLive, Migrations.layer).pipe(
  Layer.provideMerge(Layer.merge(client, host))
);
const input = {
  sourceUrl: "https://example.com/channel",
  feedUrl: "https://example.com/feed",
  platform: "custom",
} as const;
const item = (id: string, publishedAt = 1) => ({ id, title: id, url: `https://example.com/${id}`, publishedAt });
layer(services, { buildPerTest: true })((it) => {
  const run = driver === "node" || driver === "borrowed" ? it.effect : it.effect.skip;
  run(
    `${driver}: synchronous update/remove segments cannot resurrect rows with synchronous clock reads`,
    Effect.fnUntraced(function* () {
      yield* (yield* DbSchema).applySubscriptions;
      const store = yield* SubscriptionStore;
      const created = yield* store.add(input);
      const updating = yield* store
        .update(created.id, { title: "updated" })
        .pipe(Effect.forkChild({ startImmediately: true }));
      const removing = yield* store.remove(created.id).pipe(Effect.forkChild({ startImmediately: true }));
      yield* Fiber.join(updating);
      const removed = yield* Fiber.join(removing);
      expect(removed).toBe(true);
      const after = yield* store.get(created.id);
      expect(after).toBeNull();
    })
  );
  run(
    `${driver}: mutation results retain patch values while SQL retains its own representation`,
    () =>
      Effect.gen(function* () {
        yield* (yield* DbSchema).applySubscriptions;
        const store = yield* SubscriptionStore;
        const sql = yield* SqlClient.SqlClient;
        const cases: readonly { patch: F.InterpretedFeedPatch; column: string; stored: unknown }[] = [
          { patch: { coverUrl: null }, column: "cover_url", stored: null },
          { patch: { coverUrl: 42 }, column: "cover_url", stored: "42.0" },
          { patch: { coverUrl: Number.NaN }, column: "cover_url", stored: null },
          { patch: { coverUrl: Number.POSITIVE_INFINITY }, column: "cover_url", stored: "Inf" },
          { patch: { coverUrl: Number.NEGATIVE_INFINITY }, column: "cover_url", stored: "-Inf" },
          { patch: { coverUrl: 42n }, column: "cover_url", stored: "42" },
          { patch: { coverUrl: 0 }, column: "cover_url", stored: "0.0" },
          { patch: { coverUrl: "" }, column: "cover_url", stored: "" },
          { patch: { coverUrl: "art" }, column: "cover_url", stored: "art" },
          { patch: { coverUrl: undefined }, column: "cover_url", stored: null },
          { patch: { latestVideoTitle: null }, column: "latest_video_title", stored: null },
          { patch: { latestVideoTitle: 42 }, column: "latest_video_title", stored: "42.0" },
          { patch: { latestVideoTitle: 0 }, column: "latest_video_title", stored: "0.0" },
          { patch: { latestVideoTitle: "" }, column: "latest_video_title", stored: "" },
          { patch: { latestVideoTitle: "episode" }, column: "latest_video_title", stored: "episode" },
          { patch: { latestVideoTitle: undefined }, column: "latest_video_title", stored: null },
          { patch: { checkIntervalMs: null }, column: "check_interval_ms", stored: null },
          { patch: { checkIntervalMs: undefined }, column: "check_interval_ms", stored: null },
          { patch: { checkIntervalMs: 0 }, column: "check_interval_ms", stored: 0 },
          { patch: { checkIntervalMs: -1.5 }, column: "check_interval_ms", stored: -1.5 },
          { patch: { title: "changed" }, column: "title", stored: "changed" },
          { patch: { sourceUrl: "source", title: "chosen" }, column: "source_url", stored: "source" },
          { patch: { feedUrl: "feed" }, column: "feed_url", stored: "feed" },
          { patch: { platform: "future" }, column: "platform", stored: "future" },
          { patch: { status: "future" }, column: "status", stored: "future" },
          { patch: { profileOwner: "owner" }, column: "profile_owner", stored: "owner" },
          { patch: { downloadDirectory: "" }, column: "download_directory", stored: "" },
          { patch: { namingTemplate: "template" }, column: "naming_template", stored: "template" },
          { patch: { downloadType: "future" }, column: "download_type", stored: "future" },
          { patch: { downloadQuality: "future" }, column: "download_quality", stored: "future" },
          { patch: { downloadContainer: "future" }, column: "download_container", stored: "future" },
          { patch: { sourceKind: "profile" }, column: "source_kind", stored: "profile" },
          { patch: { latestVideoPublishedAt: -1.5 }, column: "latest_video_published_at", stored: -1.5 },
          { patch: { lastCheckedAt: 0 }, column: "last_checked_at", stored: 0 },
          { patch: { lastSuccessAt: 2 }, column: "last_success_at", stored: 2 },
          { patch: { nextCheckAt: 3 }, column: "next_check_at", stored: 3 },
          { patch: { lastError: "" }, column: "last_error", stored: "" },
          { patch: { createdAt: 4 }, column: "created_at", stored: 4 },
          { patch: { updatedAt: 5 }, column: "updated_at", stored: 1000 },
          { patch: { onlyDownloadLatest: false }, column: "only_latest", stored: 0 },
          { patch: { autoDownload: false }, column: "auto_download", stored: 0 },
          { patch: { enabled: false }, column: "enabled", stored: 0 },
          { patch: { keywords: ["a"] }, column: "keywords", stored: '["a"]' },
          { patch: { tags: ["a"] }, column: "tags", stored: '["a"]' },
          { patch: { categories: ["a"] }, column: "categories", stored: '["a"]' },
        ];
        for (const entry of cases) {
          const created = yield* store.add(input);
          yield* store.replaceItems(created.id, [item("kept")]);
          const before = yield* sql`SELECT * FROM subscriptions WHERE id=${created.id}`;
          const loaded = yield* store.get(created.id);
          const returned = yield* store.update(created.id, entry.patch);
          expect(returned).toEqual({ ...loaded, ...entry.patch, updatedAt: 1000 });
          expect(S.is(F.SubscriptionMutationResult)(returned)).toBe(true);
          const after = yield* sql`SELECT * FROM subscriptions WHERE id=${created.id}`;
          expect(after).toEqual([
            {
              ...before[0],
              [entry.column]: entry.stored,
              ...(entry.patch.title === undefined ? {} : { title: entry.patch.title }),
            },
          ]);
        }
        // ID is also patchable: the old upsert leaves the original parent and
        // attaches children for the new ID, rather than reusing the old children.
        const original = yield* store.add(input);
        yield* store.replaceItems(original.id, [item("original-child")]);
        const originalRows = yield* sql`SELECT * FROM subscriptions WHERE id=${original.id}`;
        const movedId = `${original.id}-moved`;
        const moved = yield* store.update(original.id, { id: movedId });
        expect(moved).toEqual({ ...original, id: movedId });
        const originalAfter = yield* sql`SELECT * FROM subscriptions WHERE id=${original.id}`;
        expect(originalAfter).toEqual(originalRows);
        const movedRows = yield* sql`SELECT * FROM subscriptions WHERE id=${movedId}`;
        expect(movedRows).toEqual([{ ...originalRows[0], id: movedId }]);
        expect((yield* store.get(original.id))?.items).toHaveLength(1);
        for (const value of [false, true, [], {}]) {
          for (const patch of [{ coverUrl: value }, { latestVideoTitle: value }]) {
            const created = yield* store.add(input);
            const before = yield* sql`SELECT * FROM subscriptions WHERE id=${created.id}`;
            const failed = yield* Effect.exit(store.update(created.id, patch));
            expect(Exit.isFailure(failed)).toBe(true);
            const after = yield* sql`SELECT * FROM subscriptions WHERE id=${created.id}`;
            expect(after).toEqual(before);
          }
        }
      }),
    30_000
  );
  run(
    `${driver}: ordering, list sanitization, unknown persisted enums and update omission`,
    () =>
      Effect.gen(function* () {
        yield* (yield* DbSchema).applySubscriptions;
        const store = yield* SubscriptionStore;
        const sql = yield* SqlClient.SqlClient;
        const created = yield* store.add({ ...input, keywords: [" a ", "a", "b"], sourceKind: "profile" });
        expect(created.keywords).toEqual(["a", "b"]);
        yield* store.update(created.id, { lastError: "retained", downloadDirectory: "" });
        const updated = yield* store.update(created.id, { lastError: undefined, coverUrl: "" });
        expect(updated?.coverUrl).toBe("");
        expect(updated?.lastError).toBeUndefined();
        expect((yield* store.get(created.id))?.lastError).toBe("retained");
        yield* sql`UPDATE subscriptions SET platform='future-platform',status='future-status',keywords='["ok",4]',only_latest=2 WHERE id=${created.id}`;
        const read = yield* store.get(created.id);
        expect(read?.platform).toBe("future-platform");
        expect(read?.status).toBe("future-status");
        expect(read?.keywords).toEqual([]);
        expect(read?.onlyDownloadLatest).toBe(false);
        const observed1 = yield* store.findDuplicateFeed("http://example.com/feed#fragment");
        expect(observed1).toBe(created.id);
      }),
    10_000
  );
  run(
    `${driver}: snapshots preserve links, duplicate new IDs roll back and profile list caps only reads`,
    () =>
      Effect.gen(function* () {
        yield* (yield* DbSchema).applySubscriptions;
        const store = yield* SubscriptionStore;
        const created = yield* store.add({ ...input, sourceKind: "profile" });
        yield* store.replaceItems(created.id, [item("a", 2), item("b", 1)]);
        yield* store.markItemQueued(created.id, "a", "task-a");
        yield* store.replaceItems(created.id, [item("a", 3)]);
        expect((yield* store.get(created.id))?.items[0]?.taskId).toBe("task-a");
        const duplicate = yield* Effect.exit(store.replaceItems(created.id, [item("x"), item("x")]));
        expect(Exit.isFailure(duplicate)).toBe(true);
        expect((yield* store.get(created.id))?.items[0]?.id).toBe("a");
        const merge = yield* Effect.exit(store.mergeItems(created.id, [item("z"), item("z")]));
        expect(Exit.isFailure(merge)).toBe(true);
        expect((yield* store.get(created.id))?.items).toHaveLength(1);
        const many = [];
        for (let n = 0; n < 302; n++) many.push(item(`id-${n}`, n));
        yield* store.replaceItems(created.id, many);
        expect((yield* store.get(created.id))?.items).toHaveLength(302);
        expect((yield* store.list)[0]?.items).toHaveLength(300);
      }),
    10_000
  );
  run(`${driver}: the orphan liveness callback and the fibers it forks keep the caller's scheduling`, () =>
    Effect.gen(function* () {
      yield* (yield* DbSchema).applySubscriptions;
      const store = yield* SubscriptionStore;
      const created = yield* store.add(input);
      yield* store.markItemQueued(created.id, "a", "gone");
      const observed: boolean[] = [];
      const caller = yield* Scheduler.PreventSchedulerYield;
      const cleared = yield* store.clearOrphanedQueueLinks(() =>
        Effect.gen(function* () {
          const inCallback = yield* Scheduler.PreventSchedulerYield;
          const forked = yield* Effect.service(Scheduler.PreventSchedulerYield).pipe(
            Effect.forkChild({ startImmediately: true })
          );
          const inForkedFiber = yield* Fiber.join(forked);
          observed.push(inCallback, inForkedFiber);
          return false;
        })
      );
      const afterwards = yield* Scheduler.PreventSchedulerYield;
      expect(cleared).toBe(1);
      expect(observed).toEqual([caller, caller]);
      expect(caller).toBe(false);
      expect(afterwards).toBe(caller);
    })
  );
  run(
    `${driver}: queue placeholders, counted clearing, unique ordered orphan lookups and parent removal`,
    () =>
      Effect.gen(function* () {
        yield* (yield* DbSchema).applySubscriptions;
        const store = yield* SubscriptionStore;
        const created = yield* store.add(input);
        yield* store.markItemQueued(created.id, "a", "gone");
        yield* store.markItemQueued(created.id, "b", "gone");
        yield* store.markItemQueued(created.id, "c", "live");
        const looked: string[] = [];
        const cleared = yield* store.clearOrphanedQueueLinks((id) =>
          Effect.sync(() => {
            looked.push(id);
            return id === "live";
          })
        );
        expect(looked).toEqual(["gone", "live"]);
        expect(cleared).toBe(2);
        const observed2 = yield* store.clearQueueLinks({
          taskIds: [" live ", "live"],
          items: [{ subscriptionId: created.id, itemId: "c" }],
        });
        expect(observed2).toBe(1);
        const observed3 = yield* store.remove(created.id);
        expect(observed3).toBe(true);
        const observed4 = yield* store.remove(created.id);
        expect(observed4).toBe(false);
        const observed5 = yield* store.get(created.id);
        expect(observed5).toBeNull();
      }),
    10_000
  );
  run(
    `${driver}: metadata CAS, null expiry refusal, preference isolation and invalid physical-row rejection`,
    () =>
      Effect.gen(function* () {
        yield* (yield* DbSchema).applySubscriptions;
        const meta = yield* SubscriptionMeta;
        const sql = yield* SqlClient.SqlClient;
        yield* meta.writePreferred("api");
        const next = {
          kind: "desktop",
          pid: 1,
          startedAt: 10,
          heartbeatAt: 10,
          lockExpiresAt: null,
          leaseId: "lease-a",
        } as const;
        const observed6 = yield* meta.casLeader({ expectedLeaseId: null, now: 10, next });
        expect(observed6).toBe(true);
        const observed7 = yield* meta.casLeader({
          expectedLeaseId: null,
          now: 999,
          next: { ...next, leaseId: "lease-b" },
        });
        expect(observed7).toBe(false);
        expect((yield* meta.readLeader).preferred).toBe("api");
        const observed8 = yield* meta.casLeader({
          expectedLeaseId: "lease-a",
          now: 11,
          next: { ...next, lockExpiresAt: 12 },
        });
        expect(observed8).toBe(true);
        const observed9 = yield* meta.casLeader({
          expectedLeaseId: null,
          now: 12,
          next: { ...next, leaseId: "lease-b" },
        });
        expect(observed9).toBe(true);
        yield* sql`INSERT INTO subscriptions_meta (key,value,updated_at) VALUES ('leader_pid','  ',0) ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
        expect((yield* meta.readLeader).pid).toBe(0);
        yield* sql`INSERT INTO subscriptions_meta (key,value,updated_at) VALUES (NULL,'private-row-content',0)`;
        const result = yield* Effect.result(meta.readLeader);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure).toBeInstanceOf(DbRowDecodeError);
          expect(String(result.failure)).not.toContain("private-row-content");
        }
      }),
    10_000
  );
  run(
    `${driver}: nested transactions roll back inner snapshots without rolling back the outer transaction`,
    () =>
      Effect.gen(function* () {
        yield* (yield* DbSchema).applySubscriptions;
        const store = yield* SubscriptionStore;
        const sql = yield* SqlClient.SqlClient;
        const created = yield* store.add(input);
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* store.replaceItems(created.id, [item("kept")]);
              const failed = yield* Effect.exit(store.replaceItems(created.id, [item("duplicate"), item("duplicate")]));
              expect(Exit.isFailure(failed)).toBe(true);
              expect((yield* store.get(created.id))?.items[0]?.id).toBe("kept");
              yield* store.mergeItems(created.id, [item("merged")]);
            })
          )
          .pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN"));
        expect((yield* store.get(created.id))?.items).toHaveLength(2);
        if (driver === "borrowed") {
          const trace = yield* SqlTrace;
          const meta = yield* SubscriptionMeta;
          for (const operation of [
            store.mergeItems(created.id, [item("trace-merge")]).pipe(Effect.asVoid),
            store.clearQueueLinks({ items: [{ subscriptionId: created.id, itemId: "missing" }] }).pipe(Effect.asVoid),
            meta
              .casLeader({
                expectedLeaseId: null,
                now: 1,
                next: { kind: "desktop", pid: 1, startedAt: 1, heartbeatAt: 1, lockExpiresAt: 2, leaseId: "trace" },
              })
              .pipe(Effect.asVoid),
          ]) {
            yield* trace.clear;
            yield* operation;
            const events = yield* trace.statements;
            expect(Arr.filter(events, (text) => Str.startsWith("BEGIN")(text))).toEqual(["BEGIN"]);
            expect(events[events.length - 1]).toBe("COMMIT");
          }
          yield* trace.clear;
          yield* store.replaceItems(created.id, [item("traced")]);
          const statements = yield* trace.statements;
          expect(Arr.filter(statements, (text) => Str.startsWith("BEGIN")(text))).toEqual(["BEGIN"]);
          expect(statements[statements.length - 1]).toBe("COMMIT");
          yield* trace.execute("BEGIN");
          yield* trace.clear;
          yield* Effect.acquireUseRelease(
            Effect.void,
            () =>
              Effect.gen(function* () {
                yield* store.replaceItems(created.id, [item("host-owned")]);
                const stillOpen = yield* trace.inTransaction;
                expect(stillOpen).toBe(true);
                const nested = yield* trace.statements;
                expect(Str.startsWith("SAVEPOINT vidbee_borrowed_")(nested[0] ?? "")).toBe(true);
                expect(Str.startsWith("RELEASE SAVEPOINT vidbee_borrowed_")(nested[nested.length - 1] ?? "")).toBe(
                  true
                );
              }),
            () => trace.execute("ROLLBACK")
          );
          expect((yield* store.get(created.id))?.items[0]?.id).toBe("traced");
        }
      }),
    10_000
  );
  run(
    `${driver}: safe-integer borrowed handles retain local conversion without mode reconfiguration`,
    () =>
      Effect.gen(function* () {
        if (driver !== "borrowed") return;
        yield* (yield* DbSchema).applySubscriptions;
        const trace = yield* SqlTrace;
        const store = yield* SubscriptionStore;
        const sql = yield* SqlClient.SqlClient;
        yield* trace.safeIntegers;
        const created = yield* store.add(input);
        yield* store.replaceItems(created.id, [item("safe", 7)]);
        yield* store.markItemQueued(created.id, "safe", "task");
        const loaded = yield* store.get(created.id);
        expect(loaded?.createdAt).toBe(1000);
        expect(loaded?.onlyDownloadLatest).toBe(true);
        expect(loaded?.items[0]?.publishedAt).toBe(7);
        expect(loaded?.items[0]?.addedToQueue).toBe(true);
        const raw = yield* sql`SELECT only_latest FROM subscriptions`;
        expect(typeof raw[0]?.only_latest).toBe("bigint");
      }),
    10_000
  );
  run(
    `${driver}: row codecs convert bigint integer fields without rejecting arbitrary enum text`,
    () =>
      Effect.gen(function* () {
        const row = yield* S.decodeEffect(R.SubscriptionItemRawRow)({
          subscriptionId: "s",
          itemId: "i",
          title: "t",
          url: "u",
          publishedAt: 2n,
          thumbnail: null,
          added: 1n,
          taskId: null,
          createdAt: 3n,
          updatedAt: 4n,
        });
        expect(R.rowToFeedItem(row)).toEqual({ id: "i", title: "t", url: "u", publishedAt: 2, addedToQueue: true });
      }),
    10_000
  );
});
layer(SubscriptionMetaMemoryLive, { buildPerTest: true })((it) => {
  it.effect(
    "memory metadata returns copies and preserves preference during CAS",
    () =>
      Effect.gen(function* () {
        const meta = yield* SubscriptionMeta;
        const first = yield* meta.readLeader;
        first.pid = 22;
        expect((yield* meta.readLeader).pid).toBeNull();
        yield* meta.writePreferred("desktop");
        const observed10 = yield* meta.casLeader({
          expectedLeaseId: null,
          now: 1,
          next: { kind: "api", pid: 1, startedAt: 1, heartbeatAt: 1, lockExpiresAt: 2, leaseId: "a" },
        });
        expect(observed10).toBe(true);
        expect((yield* meta.readLeader).preferred).toBe("desktop");
      }),
    10_000
  );
});

class ConnectionTrace extends Context.Service<
  ConnectionTrace,
  {
    readonly events: Effect.Effect<readonly { connection: number; statement: string }[]>;
    readonly clear: Effect.Effect<void>;
  }
>()("@vidbee/subscriptions-core/test/native-persistence.test/ConnectionTrace") {}
// Each acquisition gets a new identity. Unreserved methods therefore expose
// separate connections even on the single-handle SQLite test clients.
const recordedClient = Layer.effectContext(
  Effect.gen(function* () {
    const original = yield* SqlClient.SqlClient;
    const statements = yield* SqlTrace;
    const events: { connection: number; statement: string }[] = [];
    let next = 0;
    const acquirer = Effect.map(original.reserve, (connection) => {
      const id = ++next;
      const wrapped: Connection.Connection = {
        ...connection,
        execute: Effect.fn("ConnectionTrace.execute")(function* (
          ...args: Parameters<Connection.Connection["execute"]>
        ) {
          events.push({ connection: id, statement: args[0] });
          return yield* connection.execute(...args);
        }),
      };
      return wrapped;
    });
    const recorded = yield* SqlClient.make({
      acquirer,
      compiler: Statement.makeCompilerSqlite(),
      driver: "recording",
      spanAttributes: [],
    });
    return Context.make(SqlClient.SqlClient, recorded).pipe(
      Context.add(SqlTrace, statements),
      Context.add(ConnectionTrace, {
        events: Effect.sync(() => [...events]),
        clear: Effect.sync(() => {
          events.length = 0;
        }),
      })
    );
  })
).pipe(Layer.provide(Layer.merge(client, Reactivity.layer)));
const recordedServices = Layer.merge(SubscriptionStoreSqlLive, Migrations.layer).pipe(
  Layer.provideMerge(Layer.merge(recordedClient, host))
);
layer(recordedServices, { buildPerTest: true })((it) => {
  const run = driver === "node" || driver === "borrowed" ? it.effect : it.effect.skip;
  run(
    `${driver}: reserves the mutation connection through changes() and child statements`,
    Effect.fnUntraced(function* () {
      yield* (yield* DbSchema).applySubscriptions;
      const store = yield* SubscriptionStore;
      const trace = yield* ConnectionTrace;
      const created = yield* store.add(input);
      yield* trace.clear;
      yield* store.markItemQueued(created.id, "placeholder", "task");
      const marking = yield* trace.events;
      expect(marking).toHaveLength(3);
      expect(Arr.every(marking, (event) => event.connection === marking[0]?.connection)).toBe(true);
      expect(marking[1]?.statement).toBe("SELECT changes() AS changes");
      yield* trace.clear;
      const removed = yield* store.remove(created.id);
      expect(removed).toBe(true);
      const removing = yield* trace.events;
      expect(removing).toHaveLength(3);
      expect(Arr.every(removing, (event) => event.connection === removing[0]?.connection)).toBe(true);
      expect(removing[1]?.statement).toBe("SELECT changes() AS changes");
    })
  );
});

// Second-round regressions use synchronous hosts; yielding hosts are tested as
// contract violations separately, rather than supplied to ordinary SQL tests.
class SegmentHost extends Context.Service<
  SegmentHost,
  {
    readonly events: string[];
    readonly setSuspending: (value: boolean) => void;
    readonly setEntropySuspending: (value: boolean) => void;
  }
>()("@vidbee/subscriptions-core/test/native-persistence.test/SegmentHost") {}
const segmentHost = Layer.effectContext(
  Effect.sync(() => {
    const events: string[] = [];
    let suspending = false;
    let entropySuspending = false;
    let n = 0;
    return Context.make(
      SubscriptionTimers,
      SubscriptionTimers.of({
        now: Effect.suspend(() => {
          events.push("now");
          return suspending ? Effect.yieldNow.pipe(Effect.as(1000)) : Effect.succeed(1000);
        }),
        after: Effect.fn("SubscriptionTimers.after")(() => Effect.succeed(Effect.void)),
        every: Effect.fn("SubscriptionTimers.every")(() => Effect.succeed(Effect.void)),
      })
    ).pipe(
      Context.add(SubscriptionEntropy, {
        subscriptionId: Effect.suspend(() => {
          events.push("id");
          return entropySuspending ? Effect.yieldNow.pipe(Effect.as("forbidden")) : Effect.succeed(`segment-${++n}`);
        }),
        leaseId: Effect.succeed("lease"),
        next: Effect.succeed(0.5),
      }),
      Context.add(SegmentHost, {
        events,
        setEntropySuspending: (value) => {
          entropySuspending = value;
        },
        setSuspending: (value) => {
          suspending = value;
        },
      })
    );
  })
);
const segmentServices = Layer.mergeAll(SubscriptionStoreSqlLive, SubscriptionMetaSqlLive, Migrations.layer).pipe(
  Layer.provideMerge(Layer.merge(client, segmentHost))
);
layer(segmentServices, { buildPerTest: true })((it) => {
  const run = driver === "node" || driver === "borrowed" ? it.effect : it.effect.skip;
  run(
    `${driver}: large synchronous store segment permits concurrent metadata access`,
    Effect.fnUntraced(function* () {
      yield* (yield* DbSchema).applySubscriptions;
      const store = yield* SubscriptionStore;
      const meta = yield* SubscriptionMeta;
      const sub = yield* store.add(input);
      yield* store.replaceItems(
        sub.id,
        Arr.makeBy(1500, (i) => item(String(i)))
      );
      const listing = yield* store.list.pipe(Effect.forkChild({ startImmediately: true }));
      const reading = yield* meta.readLeader.pipe(Effect.forkChild({ startImmediately: true }));
      expect((yield* Fiber.join(listing))[0]?.items).toHaveLength(1500);
      expect((yield* Fiber.join(reading)).pid).toBeNull();
    }),
    30_000
  );
  run(
    `${driver}: host reads stay at the old positions and suspending clocks defect before writing`,
    Effect.fnUntraced(function* () {
      yield* (yield* DbSchema).applySubscriptions;
      const store = yield* SubscriptionStore;
      const host = yield* SegmentHost;
      const missing = yield* store.update("missing", { title: "ignored" });
      expect(missing).toBeNull();
      expect(host.events).toEqual([]);
      const sub = yield* store.add(input);
      expect(host.events).toEqual(["now", "id"]);
      const updating = yield* store
        .update(sub.id, { title: "before" })
        .pipe(Effect.forkChild({ startImmediately: true }));
      const reading = yield* (yield* SubscriptionMeta).readLeader.pipe(Effect.forkChild({ startImmediately: true }));
      yield* Fiber.join(updating);
      expect((yield* Fiber.join(reading)).pid).toBeNull();
      expect(host.events).toEqual(["now", "id", "now"]);
      host.setSuspending(true);
      const result = yield* Effect.exit(store.update(sub.id, { title: "after" }));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(Cause.hasDies(result.cause)).toBe(true);
        expect(Cause.pretty(result.cause)).toContain("database access rule 2");
      }
      host.setSuspending(false);
      expect((yield* store.get(sub.id))?.title).toBe("before");
      host.setEntropySuspending(true);
      const adding = yield* Effect.exit(store.add(input));
      expect(Exit.isFailure(adding)).toBe(true);
      if (Exit.isFailure(adding)) {
        expect(Cause.hasDies(adding.cause)).toBe(true);
        expect(Cause.pretty(adding.cause)).toContain("database access rule 2");
      }
      const forbidden = yield* store.get("forbidden");
      expect(forbidden).toBeNull();
      expect((yield* (yield* SubscriptionMeta).readLeader).pid).toBeNull();
    })
  );
  run(
    `${driver}: orphan clear without callbacks cannot erase concurrent queued links`,
    Effect.fnUntraced(function* () {
      yield* (yield* DbSchema).applySubscriptions;
      const store = yield* SubscriptionStore;
      const sub = yield* store.add(input);
      yield* store.replaceItems(
        sub.id,
        Arr.makeBy(1500, (i) => item(String(i)))
      );
      const sql = yield* SqlClient.SqlClient;
      yield* sql`UPDATE subscription_items SET added=1`;
      let callbacks = 0;
      const clearing = yield* store
        .clearOrphanedQueueLinks(() =>
          Effect.sync(() => {
            callbacks++;
            return true;
          })
        )
        .pipe(Effect.forkChild({ startImmediately: true }));
      const marking = yield* store
        .markItemQueued(sub.id, "1499", "task2")
        .pipe(Effect.forkChild({ startImmediately: true }));
      yield* Fiber.join(clearing);
      yield* Fiber.join(marking);
      expect(callbacks).toBe(0);
      const result = yield* store.get(sub.id);
      expect(Option.getOrUndefined(Arr.findFirst(result?.items ?? [], (value) => value.id === "1499"))?.taskId).toBe(
        "task2"
      );
    }),
    30_000
  );
});
