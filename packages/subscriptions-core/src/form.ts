import * as A from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
/**
 * Host-neutral helpers for the add/edit subscription form.
 */

/**
 * Split a comma-separated string into unique trimmed entries.
 *
 * @param value Raw comma-separated input.
 * @returns Deduplicated non-empty entries.
 */
export const sanitizeCommaList = (value: string): string[] =>
  A.dedupe(A.filter(A.map(Str.split(value, ","), Str.trim), (entry) => entry.length > 0));

/**
 * Normalize a filename template to use single forward slashes.
 *
 * @param value Raw template input.
 * @returns Sanitized template.
 */
export const sanitizeTemplateInput = (value: string): string =>
  pipe(value, Str.replace(/\\/g, "/"), Str.replace(/\/{2,}/g, "/"));

/**
 * Build the default Subscriptions folder under the user's download path.
 *
 * @param downloadPath Configured download directory.
 * @returns Subscriptions directory path.
 */
export const buildDefaultSubscriptionDirectory = (downloadPath: string): string => {
  const trimmed = pipe(downloadPath, Str.trim, Str.replace(/[\\/]+$/, ""));
  if (!Boolean(trimmed)) {
    return "Subscriptions";
  }
  return `${trimmed}/Subscriptions`;
};
