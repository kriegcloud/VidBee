// Pre-port compiler-emitted declaration closure; kept unchanged for compatibility checks.
import type { ChildProcess } from 'node:child_process';
/** Reap a worker before releasing its task slot, even when SIGTERM is ignored. */
export declare const terminateWorker: (child: ChildProcess, graceMs?: number) => Promise<void>;
