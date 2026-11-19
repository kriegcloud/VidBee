import { dual } from "effect/Function";
import type { SubscriptionStatus } from "./types.js";

export type { SubscriptionStatusMeta } from "./Subscription.model.js";

import type { SubscriptionStatusMeta } from "./Subscription.model.js";

const fallbackStatusMeta: SubscriptionStatusMeta = {
  dotClass: "bg-muted-foreground",
  textClass: "text-muted-foreground",
  label: "subscriptions.status.idle",
};

const enabledStatusMeta: Record<SubscriptionStatus, SubscriptionStatusMeta> = {
  "up-to-date": {
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-600",
    label: "subscriptions.status.up-to-date",
  },
  checking: {
    dotClass: "bg-sky-500",
    textClass: "text-sky-600",
    label: "subscriptions.status.checking",
  },
  failed: {
    dotClass: "bg-red-500",
    textClass: "text-red-600",
    label: "subscriptions.status.failed",
  },
  "rate-limited": {
    dotClass: "bg-amber-500",
    textClass: "text-amber-600",
    label: "subscriptions.status.rate-limited",
  },
  "auth-required": {
    dotClass: "bg-amber-500",
    textClass: "text-amber-600",
    label: "subscriptions.status.auth-required",
  },
  idle: fallbackStatusMeta,
};

export const disabledStatusMeta: SubscriptionStatusMeta = {
  dotClass: "bg-zinc-400",
  textClass: "text-muted-foreground",
  label: "subscriptions.fields.disabled",
};

/**
 * Resolve the subscription status styles without crashing on stale or unknown values.
 *
 * @param status The persisted subscription status.
 * @param enabled Whether the subscription is enabled.
 * @returns The status style metadata used by the subscriptions UI.
 */
const statusMeta = (status: string | undefined, enabled: boolean): SubscriptionStatusMeta => {
  if (!enabled) {
    return disabledStatusMeta;
  }

  if (status !== undefined && Boolean(status) && status in enabledStatusMeta) {
    return enabledStatusMeta[status as SubscriptionStatus];
  }

  return fallbackStatusMeta;
};

export type { SubscriptionItemQueueStatus } from "./Subscription.model.js";

import type { SubscriptionItemQueueStatus } from "./Subscription.model.js";

/**
 * Map a feed item to the live download status when it has been queued.
 *
 * @param item Feed item with optional task/download id.
 * @param downloadById Live and history downloads keyed by id.
 * @returns Queue or download status used by the subscriptions grid.
 */
const itemStatus = (
  item: { addedToQueue: boolean; downloadId?: string | undefined; taskId?: string | undefined },
  downloadById: ReadonlyMap<string, { status: string }>
): SubscriptionItemQueueStatus => {
  if (!item.addedToQueue) {
    return "notQueued";
  }
  const id = item.taskId ?? item.downloadId;
  const matched = Boolean(id) && id !== undefined ? downloadById.get(id) : undefined;
  // No live task means the stored queue link is stale.
  if (matched === undefined) {
    return "notQueued";
  }
  switch (matched.status) {
    case "pending":
    case "downloading":
    case "processing":
    case "completed":
    case "cancelled":
      return matched.status;
    case "error":
    case "failed":
      return "error";
    default:
      return "queued";
  }
};

export const getSubscriptionStatusMeta: {
  (status: string | undefined, enabled: boolean): SubscriptionStatusMeta;
  (enabled: boolean): (status: string | undefined) => SubscriptionStatusMeta;
} = dual(2, statusMeta);
export const resolveSubscriptionItemStatus: {
  (
    item: { addedToQueue: boolean; downloadId?: string | undefined; taskId?: string | undefined },
    downloadById: ReadonlyMap<string, { status: string }>
  ): SubscriptionItemQueueStatus;
  (
    downloadById: ReadonlyMap<string, { status: string }>
  ): (item: {
    addedToQueue: boolean;
    downloadId?: string | undefined;
    taskId?: string | undefined;
  }) => SubscriptionItemQueueStatus;
} = dual(2, itemStatus);
