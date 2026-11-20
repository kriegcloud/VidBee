// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
interface SqliteDatabase {
    exec(sql: string): void;
    prepare(sql: string): {
        get(...params: unknown[]): unknown;
        run(...params: unknown[]): {
            changes: number;
        };
    };
    close(): void;
}
export interface MergeTaskQueueDbResult {
    merged: boolean;
    tasksCopied: number;
    attemptsCopied: number;
    journalCopied: number;
    backupPath: string | null;
}
/**
 * Copy an older standalone `task-queue.db` into the unified `vidbee.db`
 * connection, then rename the source to `*.migrated`.
 */
export declare function mergeLegacyTaskQueueDb(input: {
    target: SqliteDatabase;
    legacyPath: string;
    openLegacy: (path: string) => SqliteDatabase;
}): MergeTaskQueueDbResult;
export {};
