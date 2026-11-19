// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
/**
 * Per-writer staging path so two processes never share `file.tmp`.
 *
 * @param filePath Final destination.
 */
export declare const atomicStagingPath: (filePath: string) => string;
/**
 * Move a staging file into place. Another writer may already have published
 * `dest`; that is success, not a missing-file crash.
 *
 * @param tmp Staging file unique to this writer.
 * @param dest Final path.
 */
export declare const publishAtomicFile: (tmp: string, dest: string) => void;
/**
 * Atomically replace a file so concurrent writers never share a `.tmp` name.
 *
 * @param filePath Destination path.
 * @param contents UTF-8 string or bytes.
 */
export declare const atomicWriteFile: (filePath: string, contents: string | Uint8Array) => void;
/**
 * Atomically write JSON.
 *
 * @param filePath Destination path.
 * @param value JSON-serializable value.
 */
export declare const atomicWriteJson: (filePath: string, value: unknown) => void;
