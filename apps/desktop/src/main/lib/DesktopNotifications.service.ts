import { $DesktopId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

const $TransportId = $DesktopId.create("main/lib/DesktopNotifications.service");

/**
 * Selects a live broadcast, a particular window or the notification owner; recipient resolution happens when publication runs.
 *
 * **Details**
 *
 * The example handles a non-JSON value at the boundary; decoding fails before a capability handler receives a value.
 *
 * **Example** (Handle invalid boundary input)
 *
 * ```ts
 * import { Recipients } from "./DesktopNotifications.service.js"
 * import * as S from "effect/Schema"
 * import * as Result from "effect/Result"
 * export const decoded = S.decodeUnknownResult(Recipients)(Symbol("not-wire-data"));
 * Result.isFailure(decoded) // => true
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const Recipients = S.Union([
  S.Struct({ kind: S.Literal("all-live-windows") }),
  S.Struct({ kind: S.Literal("active-main") }),
  S.Struct({ kind: S.Literal("window"), account: S.String }),
]).pipe(
  $TransportId.annoteSchema("Recipients", { description: "Recipients boundary in the desktop transport contract." })
);
/**
 * Decoded representation validated by {@link Recipients}; use the runtime codec at untrusted boundaries before passing values to typed consumers.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Recipients = typeof Recipients.Type;
/**
 * Publishes through the existing live-window registry without caching recipients or deduplicating producer calls; the producer retains its original success and finalizer publication policy.
 *
 * **Example** (Use DesktopNotifications with its owner)
 *
 * ```ts
 * import { DesktopNotifications } from "./DesktopNotifications.service.js"
 * export const publish = DesktopNotifications.use((owner) => owner.publish({ recipients: { kind: "all-live-windows" }, channel: "changed", value: 1 }));
 * // Run with the live window service; an empty registry succeeds without sending.
 * ```
 *
 * @category services
 * @since 0.0.0
 */
export class DesktopNotifications extends Context.Service<
  DesktopNotifications,
  {
    readonly publish: (input: {
      readonly recipients: Recipients;
      readonly channel: string;
      readonly value: unknown;
    }) => Effect.Effect<void, DeliveryError>;
  }
>()("vidbee/main/lib/DesktopNotifications.service/DesktopNotifications") {}

/**
 * Borrows a currently live window target and its existing send operation; account selects an explicit recipient and activeMain selects the current main target.
 *
 * @category type-level
 * @since 0.0.0
 */
export interface NotificationTarget {
  readonly account: string;
  readonly activeMain: boolean;
  readonly send: (channel: string, value: unknown) => Effect.Effect<void, DeliveryError>;
}
/**
 * Resolves recipients from the supplied live-window owner for every publication and sends in traversal order; it retains no independent recipient registry or queue.
 *
 * **Example** (Use makeNotifications with its owner)
 *
 * ```ts
 * import { makeNotifications } from "./DesktopNotifications.service.js"
 * import * as Effect from "effect/Effect"
 * export const notifications = Effect.succeed([]).pipe(makeNotifications);
 * export const publish = notifications.publish({ recipients: { kind: "all-live-windows" }, channel: "changed", value: 1 });
 * // Run publish with the live recipient resolver; this empty resolver sends nothing.
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const makeNotifications = (
  liveTargets: Effect.Effect<ReadonlyArray<NotificationTarget>>
): DesktopNotifications["Service"] => ({
  publish: Effect.fn("DesktopNotifications.publish")(function* (input) {
    const targets = yield* liveTargets;
    const selected =
      input.recipients.kind === "all-live-windows"
        ? targets
        : input.recipients.kind === "active-main"
          ? A.filter(targets, (target) => target.activeMain)
          : A.filter(
              targets,
              (target) => input.recipients.kind === "window" && target.account === input.recipients.account
            );
    yield* Effect.forEach(selected, (target) => target.send(input.channel, input.value), {
      concurrency: 1,
      discard: true,
    });
  }),
});
/**
 * Provides live-window notifications from the existing recipient resolver; rebuilding the layer does not create an independent window registry.
 *
 * **Example** (Use layer with its owner)
 *
 * ```ts
 * import { layer } from "./DesktopNotifications.service.js"
 * import * as Effect from "effect/Effect"
 * import * as Layer from "effect/Layer"
 * export const acquire = Effect.succeed([]).pipe(layer, Layer.build);
 * // Build in a scope; the empty live-window resolver sends no notifications.
 * ```
 *
 * @category layers
 * @since 0.0.0
 */
export const layer = (liveTargets: Effect.Effect<ReadonlyArray<NotificationTarget>>) =>
  Layer.succeed(DesktopNotifications, makeNotifications(liveTargets));
