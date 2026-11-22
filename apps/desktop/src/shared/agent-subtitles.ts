import { $DesktopId } from '@vidbee/identity/packages'
import * as A from 'effect/Array'
import * as HashSet from 'effect/HashSet'
import * as R from 'effect/Record'
import * as S from 'effect/Schema'

const $I = $DesktopId.create('shared/agent-subtitles')
const cueKeys = HashSet.fromIterable(['start', 'end', 'text'])
const inputKeys = HashSet.fromIterable(['language', 'append', 'cues'])

/** Version of the subtitle artifact format stored by the agent.
 * @category constants
 * @since 0.0.0
 * @example AGENT_SUBTITLE_MODEL_VERSION
 */
export const AGENT_SUBTITLE_MODEL_VERSION = 'agent-subtitles-v1'

/** Maximum number of source-time cues admitted by one tool call.
 * @category constants
 * @since 0.0.0
 * @example MAX_AGENT_SUBTITLE_CUES
 */
export const MAX_AGENT_SUBTITLE_CUES = 500

/** Source-time subtitle cue. Times are seconds; end need not exceed start.
 *
 * **Example** (Trim subtitle text)
 *
 * ```ts
 * import * as S from 'effect/Schema'
 * import { AgentSubtitleCue } from './agent-subtitles.js'
 * const cue = S.decodeUnknownSync(AgentSubtitleCue)({start: 0, end: 1, text: ' Hello '})
 * cue.text // => 'Hello'
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const AgentSubtitleCue = S.Record(S.String, S.Unknown)
  .check(
    S.makeFilter(
      (input) => A.every(R.keys(input), (key) => HashSet.has(cueKeys, key)),
      $I.annote('CueKeys', {
        description: 'Subtitle cues reject unknown string keys.',
        message: 'Unexpected subtitle cue key.'
      })
    )
  )
  .pipe(
    S.decodeTo(
      S.Struct({
        start: S.Finite.check(S.isBetween({ minimum: 0, maximum: 604_800 })).pipe(S.mutableKey),
        end: S.Finite.check(S.isGreaterThan(0), S.isLessThanOrEqualTo(604_800)).pipe(S.mutableKey),
        text: S.Trim.check(S.isBetweenLength(1, 4000)).pipe(S.mutableKey)
      })
    ),
    $I.annoteSchema('AgentSubtitleCue', {
      description: 'One trimmed subtitle cue in original source seconds.'
    })
  )

/** Decoded mutable subtitle cue.
 * @category type-level
 * @since 0.0.0
 * @example AgentSubtitleCue
 */
export type AgentSubtitleCue = typeof AgentSubtitleCue.Type

/** Tool input in original source seconds, with strict objects and trimmed language/text.
 *
 * **Example** (Decode source subtitles)
 *
 * ```ts
 * import * as S from 'effect/Schema'
 * import { AgentSubtitleInput } from './agent-subtitles.js'
 * const input = S.decodeUnknownSync(AgentSubtitleInput)({language: ' en ', cues: [{start: 0, end: 1, text: ' Caption '}]})
 * input.language // => 'en'
 * input.cues[0]?.text // => 'Caption'
 * ```
 *
 * @category schemas
 * @since 0.0.0
 * structural for legacy construction.
 */
export const AgentSubtitleInput = S.Record(S.String, S.Unknown)
  .check(
    S.makeFilter(
      (input) => A.every(R.keys(input), (key) => HashSet.has(inputKeys, key)),
      $I.annote('InputKeys', {
        description: 'Subtitle input rejects unknown string keys.',
        message: 'Unexpected subtitle input key.'
      })
    )
  )
  .pipe(
    S.decodeTo(
      S.Struct({
        language: S.Trim.check(
          S.isBetweenLength(2, 35),
          S.isPattern(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i)
        ).pipe(S.mutableKey),
        append: S.Boolean.pipe(S.optional, S.mutableKey),
        cues: S.Array(AgentSubtitleCue)
          .check(S.isBetweenLength(1, MAX_AGENT_SUBTITLE_CUES))
          .pipe(S.mutable, S.mutableKey)
      })
    ),
    $I.annoteSchema('AgentSubtitleInput', {
      description: 'Validated source-language subtitle tool input.'
    })
  )

/** Decoded mutable subtitle tool input; explicit undefined remains permitted for append.
 * @category type-level
 * @since 0.0.0
 * @example AgentSubtitleInput
 */
export type AgentSubtitleInput = typeof AgentSubtitleInput.Type
