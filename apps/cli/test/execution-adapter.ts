/**
 * Test-only observation adapter for the execution scenarios in the frozen oracle.
 * The rewrite lane reimplements these methods over the strict Effect services and
 * the retained host capabilities. This is not a published compatibility facade.
 * Pure/public export tests use candidate.ts independently.
 *
 * Scenarios exercise expiry/concurrency, probe event ordering, injected clocks,
 * catch regions, teardown and borrowed SQLite ownership that argv cannot select.
 * Keep their inputs/results and assertions fixed when replacing this adapter.
 */
export {
  AutomationClient,
  runProbe,
  run,
  ensureDesktopReady,
  readDescriptor,
  resolveDescriptorPath,
  isPidAlive,
  checkUpgrade,
  readCliVersion,
  createLocalClient,
  defaultCachePath,
  connect,
} from '@vidbee/cli';
