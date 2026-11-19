import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SubscriptionEvents } from "./SubscriptionEvents.service.js";
import { withLegacyFinally } from "./SubscriptionFinally.js";
import { SubscriptionLog } from "./SubscriptionLog.service.js";
import type { SubscriptionChangedSink } from "./SubscriptionEvents.service.js";
export const layer = Layer.effect(
  SubscriptionEvents,
  Effect.gen(function* () {
    const log = yield* SubscriptionLog;
    let depth = 0;
    let entries: Array<{ readonly sink: SubscriptionChangedSink; active: boolean }> = [];
    const prune = () => {
      if (depth === 0) entries = A.filter(entries, (entry) => entry.active);
    };
    return SubscriptionEvents.of({
      subscribe: Effect.fn("SubscriptionEvents.subscribe")((sink) =>
        Effect.sync(() => {
          if (!A.some(entries, (entry) => entry.active && entry.sink === sink)) entries.push({ sink, active: true });
          return Effect.sync(() => {
            const entry = A.findFirst(entries, (entry) => entry.active && entry.sink === sink);
            if (entry._tag === "None") return false;
            entry.value.active = false;
            prune();
            return true;
          });
        })
      ),
      emit: Effect.fnUntraced(function* (event) {
        depth++;
        const body = Effect.gen(function* () {
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const active = entry?.active === true;
            if (active && entry !== undefined)
              yield* entry.sink
                .emit(event)
                .pipe(
                  Effect.catch((error) => log.write("warn", "subscriptions: listener threw", { err: error.original }))
                );
          }
        });
        yield* withLegacyFinally(
          body,
          Effect.sync(() => {
            depth--;
            prune();
          })
        );
      }),
    });
  })
);
