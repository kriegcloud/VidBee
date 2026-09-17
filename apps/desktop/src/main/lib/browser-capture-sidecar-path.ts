import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Resolve the headed-capture sidecar bundle next to the main process. */
export const resolveBrowserCaptureSidecarScript = (moduleDir: string): string => {
  const candidates = [
    join(moduleDir, 'browser-capture-sidecar.js'),
    join(moduleDir, '../browser-capture-sidecar.js')
  ]
  const sidecar = candidates.find((path) => existsSync(path))
  if (!sidecar) {
    throw new Error(
      `Browser-capture sidecar bundle not found in ${moduleDir}; rebuild the desktop app`
    )
  }
  return sidecar
}
