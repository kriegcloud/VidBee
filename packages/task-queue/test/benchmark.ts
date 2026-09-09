import { performance } from 'node:perf_hooks'
import { TaskStore } from '../src/store'
import { task } from './fixtures'

const store = new TaskStore()
const count = 20_000
for (let i = 0; i < count; i++) {
  store.insert(task(String(i).padStart(6, '0'), { createdAt: (i * 7919) % count }))
}
const samples: number[] = []
for (let run = 0; run < 5; run++) {
  const start = performance.now()
  let cursor: string | null = null
  let visited = 0
  do {
    const page = store.list({ cursor, limit: 200 })
    cursor = page.nextCursor
    visited += page.tasks.length
  } while (cursor)
  if (visited !== count) {
    throw new Error(`Visited ${visited} tasks`)
  }
  samples.push(performance.now() - start)
}
console.log(
  JSON.stringify({
    tasks: count,
    pageSize: 200,
    passes: samples,
    medianMs: [...samples].sort((a, b) => a - b)[2]
  })
)
