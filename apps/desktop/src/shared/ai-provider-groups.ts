import { $DesktopId } from '@vidbee/identity/packages'
import * as HM from 'effect/HashMap'
import * as O from 'effect/Option'
import * as P from 'effect/Predicate'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { AiProviderConfig } from './ai-types.js'

const $I = $DesktopId.create('shared/ai-provider-groups')

/** One settings entry containing all models configured for the same provider. */

/** Recover the provider name from model suffixes added by the legacy dialog.
 *
 * **Example** (Access the aiProviderName contract)
 *
 * ```ts
 * import { aiProviderName } from './ai-provider-groups.js'
 * void aiProviderName
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function aiProviderName(provider: AiProviderConfig): string {
  if (P.isTruthy(provider.groupId)) {
    return provider.name
  }
  if (provider.name === provider.modelId) {
    return ''
  }
  if (Str.endsWith(` · ${provider.modelId}`)(provider.name)) {
    return Str.split(' · ')(provider.name)[0]
  }
  return provider.name
}

/** Group models by stable identity, with a name and endpoint fallback for old settings.
 *
 * **Example** (Access the groupAiProviders contract)
 *
 * ```ts
 * import { groupAiProviders } from './ai-provider-groups.js'
 * void groupAiProviders
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function groupAiProviders(providers: AiProviderConfig[]): AiProviderGroup[] {
  let groups = HM.empty<string, AiProviderGroup>()
  const ordered: AiProviderGroup[] = []
  for (const provider of providers) {
    const name = aiProviderName(provider)
    const key = P.isTruthy(provider.groupId)
      ? `group:${provider.groupId}`
      : O.getOrElse(
          S.encodeOption(S.fromJsonString(S.Unknown))([
            provider.presetId,
            Str.replace(/\/+$/, '')(provider.baseUrl),
            name
          ]),
          () => ''
        )
    const group = O.getOrUndefined(HM.get(groups, key))
    if (group === undefined) {
      const next = {
        id: provider.groupId ?? provider.id,
        name,
        providers: [provider]
      }
      groups = HM.set(groups, key, next)
      ordered.push(next)
    } else {
      group.providers.push(provider)
    }
  }
  return ordered
}

/** AiProviderGroup shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AiProviderGroup input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AiProviderGroup } from './ai-provider-groups.js'
 * strictEqual(S.is(AiProviderGroup)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AiProviderGroup = S.Struct({
  id: S.String.pipe(S.mutableKey),
  name: S.String.pipe(S.mutableKey),
  providers: S.Array(AiProviderConfig).pipe(S.mutable, S.mutableKey)
}).pipe(
  $I.annoteSchema('AiProviderGroup', {
    description: 'AiProviderGroup shared boundary data.'
  })
)
/** Decoded mutable AiProviderGroup data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AiProviderGroup contract)
 *
 * ```ts
 * import { AiProviderGroup } from './ai-provider-groups.js'
 * void AiProviderGroup
 * ```
 *
 */
export type AiProviderGroup = typeof AiProviderGroup.Type
