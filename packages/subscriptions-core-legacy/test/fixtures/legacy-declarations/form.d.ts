// Pre-port compiler-emitted declarations kept for compile-time compatibility checks.
// Frozen before the Effect rewrite; nothing imports this fixture yet.
/**
 * Host-neutral helpers for the add/edit subscription form.
 */
/**
 * Split a comma-separated string into unique trimmed entries.
 *
 * @param value Raw comma-separated input.
 * @returns Deduplicated non-empty entries.
 */
export declare const sanitizeCommaList: (value: string) => string[];
/**
 * Normalize a filename template to use single forward slashes.
 *
 * @param value Raw template input.
 * @returns Sanitized template.
 */
export declare const sanitizeTemplateInput: (value: string) => string;
/**
 * Build the default Subscriptions folder under the user's download path.
 *
 * @param downloadPath Configured download directory.
 * @returns Subscriptions directory path.
 */
export declare const buildDefaultSubscriptionDirectory: (downloadPath: string) => string;
