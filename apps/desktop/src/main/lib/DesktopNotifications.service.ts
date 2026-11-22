import * as A from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import type { DeliveryError } from "../../renderer/src/transport/DocumentDelivery.errors.js";

export const Recipients = S.Union([
  S.Struct({ kind: S.Literal("all-live-windows") }),
  S.Struct({ kind: S.Literal("active-main") }),
  S.Struct({ kind: S.Literal("window"), account: S.String }),
]);
export type Recipients = typeof Recipients.Type;
/** Producers call twice where their existing success/finalizer policy calls twice. */
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

export interface NotificationTarget {
  readonly account: string;
  readonly activeMain: boolean;
  readonly send: (channel: string, value: unknown) => Effect.Effect<void, DeliveryError>;
}
/** Borrow the existing live-window owner; this adapter keeps no recipient map or queue. */
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
export const layer = (liveTargets: Effect.Effect<ReadonlyArray<NotificationTarget>>) =>
  Layer.succeed(DesktopNotifications, makeNotifications(liveTargets));
