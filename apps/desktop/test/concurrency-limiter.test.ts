import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLimiter } from '../src/main/lib/concurrency-limiter'

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1))

test('distinct jobs never exceed the cap and all complete in FIFO start order', async () => {
  const limit = createLimiter(2)
  let running = 0
  let peak = 0
  const started: number[] = []
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      limit(async () => {
        started.push(index)
        running += 1
        peak = Math.max(peak, running)
        await tick()
        running -= 1
        return index * 2
      })
    )
  )
  assert.equal(peak, 2)
  assert.deepEqual(
    results,
    Array.from({ length: 10 }, (_, index) => index * 2)
  )
  assert.deepEqual(
    started,
    Array.from({ length: 10 }, (_, index) => index)
  )
})

test('a rejected job frees its slot for the next one', async () => {
  const limit = createLimiter(1)
  const failing = limit(async () => {
    await tick()
    throw new Error('ffmpeg failed')
  })
  const following = limit(async () => 'rendered')
  await assert.rejects(failing, /ffmpeg failed/)
  assert.equal(await following, 'rendered')
})

test('a synchronous throw inside a job also frees its slot', async () => {
  const limit = createLimiter(1)
  await assert.rejects(
    limit(() => {
      throw new Error('boom')
    }),
    /boom/
  )
  assert.equal(await limit(async () => 'ok'), 'ok')
})
