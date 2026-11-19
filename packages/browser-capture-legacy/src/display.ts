import * as Effect from 'effect/Effect'
import { runLegacyPromise } from '@vidbee/task-queue-legacy/runtime'
import { VirtualDisplay as DisplayService } from '../../browser-capture/src/VirtualDisplay.service.js'
import { platformRuntime } from './PlatformHost.adapter.js'
import { captureError } from './errors.js'
export interface VirtualDisplay { display: string; pulseSink?: string; stop: () => Promise<void>; }
export const startVirtualDisplay = (input: { width: number; height: number }): Promise<VirtualDisplay> => runLegacyPromise(platformRuntime,
  Effect.map(Effect.flatMap(DisplayService, service => service.start(input)), handle => ({display:handle.display,pulseSink:handle.pulseSink,stop:()=>runLegacyPromise(platformRuntime,handle.stop,captureError)})),captureError)
