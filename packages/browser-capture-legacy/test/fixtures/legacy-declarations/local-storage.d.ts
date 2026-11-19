// Frozen pre-port compiler-emitted declaration closure; kept for compile-time compatibility checks.
/**
 * Best-effort read of a Chromium localStorage value from a profile directory.
 *
 * Copies `Local Storage/leveldb` aside (the live browser holds the lock) and
 * scans WAL `.log` files plus snappy `.ldb` blocks for `key` followed by a
 * value matching `valueRe`.
 */
export declare const readLocalStorageValue: (profileDir: string, key: string, valueRe?: RegExp) => Promise<string | null>;
