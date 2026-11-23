import fs from 'node:fs'
import os from 'node:os'

// The settings store flushes every write to disk, so the source matrices are bound by disk latency.
// Keep their throwaway profiles in memory where the host has it: the observations do not depend on it.
export const scratchRoot = () => {
  try {
    fs.accessSync('/dev/shm', fs.constants.W_OK | fs.constants.X_OK)
    return '/dev/shm'
  } catch {
    return os.tmpdir()
  }
}
