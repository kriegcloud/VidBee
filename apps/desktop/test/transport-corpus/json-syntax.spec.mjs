import assert from 'node:assert/strict'
import { it } from '@effect/vitest'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as S from 'effect/Schema'
import { NativeJsonSyntaxCompatibility } from '../../src/main/lib/legacy/JsonSyntax.compat.js'
import { OriginalFailure, unwrapOriginal } from '../../src/main/lib/OriginalFailure.errors.js'

it('named native JSON compatibility retains actual syntax failures and populated native messages', async () => {
  for (const source of ['', '{', '{"x":}', '[1,]', 'undefined', '{"x":NaN}']) {
    let native
    try {
      JSON.parse(source)
    } catch (error) {
      native = error
    }
    const result = await Effect.runPromise(Effect.exit(NativeJsonSyntaxCompatibility.parse(source)))
    assert(Exit.isFailure(result))
    const carrier = Cause.squash(result.cause)
    assert(S.is(OriginalFailure)(carrier))
    const actual = unwrapOriginal(carrier)
    assert(actual instanceof SyntaxError)
    assert.equal(actual.message, native.message)
    assert.equal(carrier.legacyMessage, actual.message)
    assert.equal(actual, carrier.original)
  }
  for (const source of ['null', 'false', '0', '""', '{"x":1}', '[null,1]']) {
    assert.deepEqual(
      await Effect.runPromise(NativeJsonSyntaxCompatibility.parse(source)),
      JSON.parse(source)
    )
  }
})
