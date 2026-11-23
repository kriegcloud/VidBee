import { expect, it } from '@effect/vitest'
import { sourceLoader } from '../../../../scripts/desktop-foundation/source-harness.mjs'

it('installs the additional narrow bridge on the actual preload without adding legacy proxy groups', async () => {
  const exposed = {},
    listeners = [],
    sent = []
  const ipcRenderer = {
    on: (channel, listener) => listeners.push([channel, listener]),
    removeListener: (channel, listener) => {
      const index = listeners.findIndex((row) => row[0] === channel && row[1] === listener)
      if (index >= 0) {
        listeners.splice(index, 1)
      }
    },
    send: (...args) => sent.push(args),
    invoke: async (channel) => ({ channel })
  }
  sourceLoader({
    $includeFoundationBridge: true,
    $process: { contextIsolated: true },
    '@better-auth/electron/preload': { setupRenderer: () => {} },
    '@electron-toolkit/preload': { electronAPI: { ipcRenderer } },
    '@vidbee/logger/legacy/client': { logger: { error: () => {} } },
    electron: {
      contextBridge: {
        exposeInMainWorld: (key, value) => {
          exposed[key] = value
        }
      },
      ipcRenderer,
      webUtils: { getPathForFile: () => '' }
    }
  })('apps/desktop/src/preload/index.ts')
  expect(Object.keys(exposed.api)).toEqual(['on', 'removeListener', 'send', 'getPathForFile'])
  expect(Object.keys(exposed.vidbeeRpc).sort()).toEqual([
    'connect',
    'disconnect',
    'send',
    'subscribe'
  ])
  expect((await exposed.vidbeeRpc.connect()).channel).toBe('vidbee:rpc:connect:v1')
  const received = []
  const release = exposed.vidbeeRpc.subscribe((frame) => received.push(frame))
  const listener = listeners.find((row) => row[0] === 'vidbee:rpc:message:v1')[1]
  listener({ native: 'must not escape' }, 'frame')
  expect(received).toEqual(['frame'])
  release()
  release()
  listener({}, 'late')
  expect(received).toEqual(['frame'])
  exposed.vidbeeRpc.send('message')
  exposed.vidbeeRpc.disconnect('document')
  expect(sent).toContainEqual(['vidbee:rpc:message:v1', 'message'])
  expect(sent).toContainEqual(['vidbee:rpc:end:v1', 'document'])
})
