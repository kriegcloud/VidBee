import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import { TaskEvents } from "./TaskEvents.service.js";
import type { TaskQueueEvent } from "./Events.model.js";
import type { TaskQueueListener } from "./TaskEvents.service.js";

interface Entry {
  active: boolean;
  readonly listener: TaskQueueListener;
}
interface Bucket {
  depth: number;
  entries: Entry[];
}
export const layer = Layer.effect(
  TaskEvents,
  Effect.gen(function* () {
    const listeners = MutableHashMap.empty<TaskQueueEvent["type"] | "*", Bucket>();
    const pubsub = yield* PubSub.sliding<TaskQueueEvent>(1024);
    const get = (key: TaskQueueEvent["type"] | "*") => Option.getOrUndefined(MutableHashMap.get(listeners, key));
    const prune = (bucket: Bucket) => {
      if (bucket.depth === 0) bucket.entries = A.filter(bucket.entries, (entry) => entry.active);
    };
    const subscribe = (key: TaskQueueEvent["type"] | "*", listener: TaskQueueListener) =>
      Effect.sync(() => {
        const bucket = get(key) ?? { entries: [], depth: 0 };
        MutableHashMap.set(listeners, key, bucket);
        if (!A.some(bucket.entries, (item) => item.active && item.listener === listener))
          bucket.entries.push({ listener, active: true });
        return () => {
          const current = A.findFirst(bucket.entries, (item) => item.active && item.listener === listener);
          if (Option.isSome(current)) current.value.active = false;
          if (!A.some(bucket.entries, (item) => item.active) && get(key) === bucket)
            MutableHashMap.remove(listeners, key);
          prune(bucket);
        };
      });
    return TaskEvents.of({
      subscribe: Effect.fn("TaskEvents.subscribe")((listener) => subscribe("*", listener)),
      on: Effect.fn("TaskEvents.on")((type, listener) => subscribe(type, listener as TaskQueueListener)),
      emit: Effect.fnUntraced(function* (event) {
        for (const key of [event.type, "*"] as const) {
          const bucket = get(key);
          if (bucket !== undefined) {
            bucket.depth++;
            yield* Effect.gen(function* () {
              for (const entry of bucket.entries) {
                if (entry.active)
                  yield* Effect.sync(() => entry.listener(event)).pipe(
                    Effect.catchCause((cause) => Effect.logError("task_queue_listener_threw", cause))
                  );
              }
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  bucket.depth--;
                  prune(bucket);
                })
              )
            );
          }
        }
        yield* PubSub.publish(pubsub, event);
      }),
      stream: Stream.fromPubSub(pubsub),
    });
  })
);
