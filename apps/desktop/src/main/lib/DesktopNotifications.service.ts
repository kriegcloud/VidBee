import { $DesktopId } from "@vidbee/identity/packages";
import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

const $TransportId = $DesktopId.create("main/lib/DesktopNotifications.service");

/**
 * Validates Recipients at the desktop transport boundary before dispatch.
 *
 * **Example** (Use Recipients at its owning boundary)
 *
 * ```ts
 * import { Recipients } from "./DesktopNotifications.service.js"
 * import * as S from "effect/Schema"
 * const decode = S.decodeUnknownEffect(Recipients);
 * const validated = decode({});
 * void validated;
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
 * Describes Recipients ownership at the desktop transport boundary.
 *
 * @category type-level
 * @since 0.0.0
 */
export type Recipients = typeof Recipients.Type;
/**
 * Producers call twice where their existing success/finalizer policy calls twice.
 *
 * **Example** (Use DesktopNotifications at its owning boundary)
 *
 * ```ts
 * import { DesktopNotifications } from "./DesktopNotifications.service.js"
 * import * as Effect from "effect/Effect"
 * const access = DesktopNotifications.use(Effect.succeed);
 * void access;
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
 * Describes Notification Target ownership at the desktop transport boundary.
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
 * Borrow the existing live-window owner; this adapter keeps no recipient map or queue.
 *
 * **Example** (Use makeNotifications at its owning boundary)
 *
 * ```ts
 * import { makeNotifications } from "./DesktopNotifications.service.js"
 * import * as Effect from "effect/Effect"
 * const notifications = makeNotifications(Effect.succeed([]));
 * void notifications.publish({ recipients: { kind: "all-live-windows" }, channel: "changed", value: 1 });
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
 * Constructs layer with explicit lifetime and failure ownership.
 *
 * **Example** (Use layer at its owning boundary)
 *
 * ```ts
 * import { layer } from "./DesktopNotifications.service.js"
 * import * as Layer from "effect/Layer"
 * const provide = (options: Parameters<typeof layer>[0]) => layer(options).pipe(Layer.build);
 * void provide;
 * ```
 *
 * @category layers
 * @since 0.0.0
 */
export const layer = (liveTargets: Effect.Effect<ReadonlyArray<NotificationTarget>>) =>
  Layer.succeed(DesktopNotifications, makeNotifications(liveTargets));
