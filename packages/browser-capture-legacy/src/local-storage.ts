import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { readLocalStorageValue as read } from '../../browser-capture/src/local-storage.js'
import { platformRuntime } from './PlatformHost.adapter.js'
import { captureError } from './errors.js'
export const readLocalStorageValue = (profileDir: string, key: string, valueRe = /[0-9a-f]{40}/): Promise<string | null> => runLegacyPromise(platformRuntime,read(profileDir,key,valueRe),captureError)
