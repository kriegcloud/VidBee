import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { it } from '@effect/vitest'
import * as RpcSchema from 'effect/rpc/RpcSchema'
import * as S from 'effect/Schema'
import { AiRpcs } from '../../src/renderer/src/transport/census/Ai.rpc.js'
import * as Downloads from '../../src/renderer/src/transport/census/Downloads.rpc.js'
import { AccountRpcs, McpRpcs } from '../../src/renderer/src/transport/census/Integration.rpc.js'
import { SubscriptionRpcs } from '../../src/renderer/src/transport/census/Subscription.rpc.js'
import { TranscriptRpcs } from '../../src/renderer/src/transport/census/Transcript.rpc.js'

const digest = (schema) =>
  createHash('sha256')
    .update(JSON.stringify(S.toRepresentation(schema)))
    .digest('hex')
export const declarations = () => {
  const result = []
  for (const [capability, groups] of [
    ['downloads', Object.values(Downloads).filter((value) => value?.requests)],
    ['subscriptions', [SubscriptionRpcs]],
    ['transcription', [TranscriptRpcs]],
    ['ai-chat', [AiRpcs]],
    ['integrations', [McpRpcs, AccountRpcs]]
  ]) {
    for (const group of groups) {
      for (const [tag, rpc] of group.requests) {
        const stream = RpcSchema.getStreamSchemas(rpc.successSchema)
        result.push({
          capability,
          tag,
          stream: stream._tag === 'Some',
          payload: digest(rpc.payloadSchema),
          success: digest(rpc.successSchema),
          error: digest(rpc.errorSchema)
        })
      }
    }
  }
  return result.sort((a, b) => a.tag.localeCompare(b.tag))
}
it('frozen five-capability exact declaration census: 181 procedures, 166 unary and 15 streams', () => {
  const frozen = JSON.parse(readFileSync(new URL('./declarations.json', import.meta.url), 'utf8'))
  const actual = declarations()
  assert.deepEqual(actual, frozen.declarations)
  assert.equal(actual.length, 181)
  assert.equal(actual.filter((entry) => entry.stream).length, 15)
  for (const [name, count] of [
    ['downloads', 77],
    ['subscriptions', 8],
    ['transcription', 29],
    ['ai-chat', 51],
    ['integrations', 16]
  ]) {
    assert.equal(actual.filter((entry) => entry.capability === name).length, count, name)
  }
})
