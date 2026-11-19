import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
const root = fileURLToPath(new URL('../../../', import.meta.url))
describe('isolated capture timer liveness', () => {
  for (const keepAlive of [true, false]) {
    it(`legacy after keepAlive=${keepAlive} preserves process-exit behavior`, () => {
      const program = `
        import * as Effect from 'effect/Effect';
        import * as ManagedRuntime from 'effect/ManagedRuntime';
        import { CaptureTimers } from './packages/browser-capture/src/CaptureTimers.service.ts';
        import { makeLegacyCaptureTimers } from './packages/browser-capture-legacy/src/CapturePlatform.layer.ts';
        import { captureError } from './packages/browser-capture-legacy/src/errors.ts';
        const runtime=ManagedRuntime.make(makeLegacyCaptureTimers(()=>runtime,captureError));
        const timers=runtime.runSync(CaptureTimers);
        // Wait for tsx loader activity to drain before measuring timer ownership.
        process.once('beforeExit',()=>{
          runtime.runSync(timers.after(100,Effect.sync(()=>console.log('action')),{keepAlive:${keepAlive}}));
          console.log('scheduled');
        });
      `
      const result = spawnSync(NODE, ['--import', 'tsx', '--input-type=module', '-e', program], { cwd: root, encoding: 'utf8', timeout: 30000 })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toBe(keepAlive ? 'scheduled\naction\n' : 'scheduled\n')
    }, 60000)
  }
  it('native referenced after keeps the child alive until its action', () => {
    const program = `
      import * as Effect from 'effect/Effect';
      import * as ManagedRuntime from 'effect/ManagedRuntime';
      import { CaptureTimers } from './packages/browser-capture/src/CaptureTimers.service.ts';
      import { CaptureTimersLive } from './packages/browser-capture/src/CaptureTimers.driver.ts';
      const runtime=ManagedRuntime.make(CaptureTimersLive);
      const timers=runtime.runSync(CaptureTimers);
      process.once('beforeExit',()=>{
        runtime.runSync(timers.after(100,Effect.sync(()=>console.log('action')),{keepAlive:true}));
        console.log('scheduled');
      });
    `
    const result = spawnSync(NODE, ['--import', 'tsx', '--input-type=module', '-e', program], { cwd: root, encoding: 'utf8', timeout: 30000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('scheduled\naction\n')
  }, 60000)
})
