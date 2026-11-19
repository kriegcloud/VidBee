import { expect, it } from '@effect/vitest'
import { TaskQueueAPI, MemoryPersistAdapter } from '@vidbee/task-queue-legacy'
import { classify, defaultMaxAttempts, parseRetryAfter, takeStderrTail, virtualError } from '@vidbee/task-queue-legacy/classifier'

it('M12/M13: legacy unknown-category and invalid-stderr errors preserve deliberate errors and fail invalid stderr', () => {
  for (const fn of [() => Reflect.apply(virtualError, undefined, ['bad', 'message']), () => Reflect.apply(defaultMaxAttempts, undefined, ['bad'])]) {
    try { fn(); throw new Error('did not throw') } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(error?.constructor).toBe(Error)
      expect(error?.message).toBe('no rule for category bad')
    }
  }
  for (const value of [undefined, null, 0, false, Number.NaN, 42]) {
    expect(() => Reflect.apply(takeStderrTail, undefined, [value])).toThrow()
  }
  expect(() => Reflect.apply(classify, undefined, [{ stderr: 42 }])).toThrow()
})
it('M4/M11: legacy date parsing matches Date.parse including local times and named zones', () => {
  const now = Date.now()
  for (const year of [2000, 2099, 2100]) for (const suffix of ['', ' UTC', ' EST', ' GMT', ' +0000', ' +0530']) {
    const header = `Wed, 21 Oct ${year} 07:28:00${suffix}`
    const expected = Math.max(0, Date.parse(header) - now)
    const result = parseRetryAfter(header)
    if (Number.isNaN(expected)) expect(result).toBe(null)
    else expect(Math.abs((result ?? -1) - expected)).toBeLessThan(100)
  }
  expect(parseRetryAfter('garbage')).toBe(null)
  expect(parseRetryAfter('12')).toBe(12000)
})
it('M2/M9: falsy request ids, subscription ids and raw arguments retain old admission behavior', async () => {
  for (const value of [null, 0, '', Number.NaN, false, undefined]) {
    let runs = 0
    const queue = new TaskQueueAPI({ persist: new MemoryPersistAdapter(), idleQueueKickMs: 0,
      executor: { run: () => { runs++; return { cancel: async () => {}, pause: async () => {} } } } })
    await queue.start()
    try {
      const result = await Reflect.apply(queue.add, queue, [{ id: value, input: { kind: 'video', url: 'https://example.com/a', subscriptionId: value, rawArgs: value } }])
      expect(queue.get(result.id)?.groupKey).toBe('example.com')
      expect(queue.get(result.id)?.status).toBe('running')
      expect(runs).toBe(1)
    } finally { await queue.stop() }
  }
})

it('M9: importing with a falsy id on a fresh store preserves nullish id generation', async () => {
  for (const value of [null, 0, '', Number.NaN, false, undefined]) {
    const queue = new TaskQueueAPI({ persist: new MemoryPersistAdapter(), idleQueueKickMs: 0,
      executor: { run: () => ({ cancel: async () => {}, pause: async () => {} }) } })
    await queue.start()
    try {
      const result = await Reflect.apply(queue.importCompleted, queue, [{ id: value, input: { kind: 'video', url: 'https://example.com/import' }, output: { filePath: '/fixture.mp4', size: 1, durationMs: null, sha256: null } }])
      expect(result.created).toBe(true)
      expect(queue.get(result.id)?.status).toBe('completed')
    } finally { await queue.stop() }
  }
})

it('M3: invalid non-string queries fail', async () => {
  const queue = new TaskQueueAPI({ persist: new MemoryPersistAdapter(), idleQueueKickMs: 0,
    executor: { run: () => ({ cancel: async () => {}, pause: async () => {} }) } })

  try {
    for (const value of [0, false, Number.NaN]) {
      expect(() => Reflect.apply(queue.list, queue, [{ query: value }])).toThrow()
    }
  } finally { await queue.stop() }
})
