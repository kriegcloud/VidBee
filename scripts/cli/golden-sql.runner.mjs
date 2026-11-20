import { fileURLToPath } from 'node:url';
import { isolated } from './characterization/isolation.mjs';

// The standard desktop harness has no outer CLI namespace. Always establish one,
// even when the caller is already isolated; never infer isolation from a flag.
const evidence = process.argv[2];
const worker = fileURLToPath(new URL('./golden-sql.worker.mjs', import.meta.url));
const result = isolated([worker, evidence], 120_000, evidence);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) process.stderr.write(String(result.error) + '\n');
process.exitCode = result.status ?? 1;
