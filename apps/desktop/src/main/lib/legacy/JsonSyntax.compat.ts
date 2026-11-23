import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { JsonSyntax } from '../JsonSyntax.service.js'
import { originalFailure } from '../OriginalFailure.errors.js'

/** Named legacy compatibility unit: preserve the native parser exception itself. */
export const NativeJsonSyntaxCompatibility: JsonSyntax['Service'] = {
  parse: (source) =>
    Effect.try({
      try: (): unknown => JSON.parse(source),
      catch: (original) =>
        originalFailure({
          original,
          operation: 'JsonSyntax.parse',
          legacyMessage: original instanceof Error ? original.message : String(original)
        })
    })
}

export const layer = Layer.succeed(JsonSyntax, NativeJsonSyntaxCompatibility)
