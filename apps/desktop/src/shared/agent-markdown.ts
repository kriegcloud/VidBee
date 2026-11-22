import { $DesktopId } from '@vidbee/identity/packages'
import * as A from 'effect/Array'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as HM from 'effect/HashMap'
import * as HS from 'effect/HashSet'
import * as O from 'effect/Option'
import * as Order from 'effect/Order'
import * as P from 'effect/Predicate'
import * as S from 'effect/Schema'
import * as Str from 'effect/String'
import { AgentArtifact } from './AgentAttachment.model'
import { SharedOperationError } from './AgentFailure.model'
import * as Sparse from './ArrayHelpers.js'
import { PROMPT_CLOCK_PATTERN, parsePromptClock } from './ai-prompt-text'
import { recordFunction } from './RecordFunction.js'

const $I = $DesktopId.create('shared/agent-markdown')

/** Markdown image or link: `![alt](url)` / `[alt](url)`.
 *
 * **Example** (Access the AGENT_MARKDOWN_MEDIA contract)
 *
 * ```ts
 * import { AGENT_MARKDOWN_MEDIA } from './agent-markdown.js'
 * void AGENT_MARKDOWN_MEDIA
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const AGENT_MARKDOWN_MEDIA = /(!?)\[([^\]]*)\]\(([^)]+)\)/g

/** Legacy matcher for `artifact:` UUID citations, including image and link forms.
 *
 * **Example** (Access the ARTIFACT_REFERENCE contract)
 *
 * ```ts
 * import { ARTIFACT_REFERENCE } from './agent-markdown.js'
 * void ARTIFACT_REFERENCE
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export const ARTIFACT_REFERENCE = /!?\[([^\]]*)\]\(artifact:([0-9a-f-]{36})\)/gi
const ARTIFACT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ARTIFACT_PREFIX = /^[0-9a-f]{8,}$/i
const IMAGE_CUE_RANGE = /(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*(?:秒|seconds?\b|s\b)/i

/** Read a stored screenshot from `artifact:uuid`, a bare uuid, or a unique 8+ character prefix. */
function artifactIdFromUrlBody(url: string, artifacts: AgentArtifact[] = []): string | undefined {
  const raw = Str.replace(/^artifact:/i, '')(Str.trim(url))
  if (ARTIFACT_UUID.test(raw)) {
    return Str.toLowerCase(raw)
  }
  if (!ARTIFACT_PREFIX.test(raw)) {
    return undefined
  }
  const needle = Str.toLowerCase(raw)
  const matches = Sparse.filter({
    items: artifacts,
    predicate: (item) => {
      const id = Str.toLowerCase(item.id)
      return Str.startsWith(needle)(id) || Str.startsWith(needle)(Str.replace(/-/g, '')(id))
    }
  })
  return matches.length === 1 ? Str.toLowerCase(matches[0]?.id ?? '') : undefined
}

/** Read a screenshot's clock or the midpoint of a cited subtitle range in seconds. */
function clockFromImageBody(alt: string, url: string): number | null {
  const matches = O.getOrNull(Str.match(new RegExp(PROMPT_CLOCK_PATTERN, 'g'))(`${alt} ${url}`))
  const token = matches?.at(-1)
  if (token !== undefined && token.length > 0) {
    return parsePromptClock(token)
  }
  const range = O.getOrNull(Str.match(IMAGE_CUE_RANGE)(alt))
  if (range === null) {
    return null
  }
  const start = Number(range[1])
  const end = Number(range[2])
  return end >= start ? (start + end) / 2 : null
}

/**
 * Pick the unused image whose source time is closest to the cited clock.
 *
 * @param runId When set, clock matches stay inside that run.
 * @param returnedIds Frames this capture returned, including a cache hit from an earlier run.
 */
function matchArtifactByClockBody(
  artifacts: AgentArtifact[],
  used: HS.HashSet<string>,
  time: number | null,
  runId?: string,
  returnedIds?: HS.HashSet<string>
): AgentArtifact | undefined {
  if (time === null) {
    return undefined
  }
  return A.sort(
    Sparse.filter({
      items: artifacts,
      predicate: (artifact) =>
        artifact.kind === 'image' &&
        !HS.has(used, artifact.id) &&
        Math.abs(artifact.start - time) <= 5 &&
        (runId === undefined ||
          artifact.runId === runId ||
          (returnedIds === undefined ? false : HS.has(returnedIds, Str.toLowerCase(artifact.id))))
    }),
    Order.make<AgentArtifact>((left, right) => {
      const difference = Math.abs(left.start - time) - Math.abs(right.start - time)
      return difference < 0 ? -1 : difference > 0 ? 1 : 0
    })
  )[0]
}
interface ArticleImageClaim {
  index: number
  raw: string
  alt: string
  time: number | null
  artifact?: AgentArtifact | undefined
}

/**
 * Claim one artifact for a markdown image or link.
 *
 * An explicit id wins and is consumed. Clock matching is image-only, and the
 * claimed frame cannot satisfy a later citation.
 *
 * @param allowClock When false, only an explicit artifact id can match.
 * @param returnedIds Frames this capture returned, including a cache hit from an earlier run.
 */
function claimArticleArtifact(
  artifacts: AgentArtifact[],
  used: {
    value: HS.HashSet<string>
  },
  alt: string,
  url: string,
  runId: string | undefined,
  allowClock: boolean,
  returnedIds?: HS.HashSet<string>
): {
  artifact?: AgentArtifact | undefined
  time: number | null
} {
  const time = allowClock ? clockFromImageBody(alt, url) : null
  const id = artifactIdFromUrlBody(url, artifacts)
  const artifact =
    (id !== undefined && id.length > 0
      ? O.getOrUndefined(A.findFirst(artifacts, (item) => Str.toLowerCase(item.id) === id))
      : undefined) ??
    (allowClock
      ? matchArtifactByClockBody(artifacts, used.value, time, runId, returnedIds)
      : undefined)
  if (artifact !== undefined) {
    used.value = HS.add(used.value, artifact.id)
  }
  return {
    artifact,
    time
  }
}

/**
 * Claim one exclusive artifact for each markdown image, in document order.
 *
 * @param runId When set, clock matches stay inside that run. Explicit ids do not.
 * @param returnedIds Frames this capture returned, including a cache hit from an earlier run.
 */
function claimArticleImages(
  text: string,
  artifacts: AgentArtifact[],
  runId?: string,
  returnedIds?: HS.HashSet<string>
): ArticleImageClaim[] {
  const used = {
    value: HS.empty<string>()
  }
  const claims: ArticleImageClaim[] = []
  for (const match of Str.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)(text)) {
    const alt = match[1] ?? ''
    const url = match[2] ?? ''
    const { artifact, time } = claimArticleArtifact(
      artifacts,
      used,
      alt,
      url,
      runId,
      true,
      returnedIds
    )
    claims.push({
      index: match.index ?? 0,
      raw: match[0],
      alt,
      time,
      artifact
    })
  }
  return claims
}

/**
 * Rewrite screenshot markdown onto real `artifact:` ids after frames have been captured.
 *
 * @param returnedIds Frames this capture returned, including a cache hit from an earlier run.
 */
function bindArticleImageArtifactsBody(
  text: string,
  artifacts: AgentArtifact[],
  runId: string,
  returnedIds?: HS.HashSet<string>
): string {
  const pieces: string[] = []
  let position = 0
  for (const image of claimArticleImages(text, artifacts, runId, returnedIds)) {
    pieces.push(Str.slice(position, image.index)(text))
    pieces.push(
      image.artifact === undefined ? image.raw : `![${image.alt}](artifact:${image.artifact.id})`
    )
    position = image.index + image.raw.length
  }
  pieces.push(Str.slice(position)(text))
  return A.join(pieces, '')
}

/**
 * Collect screenshot times that did not claim an exclusive stored frame.
 *
 * A frame within five seconds can satisfy only one citation. The next nearby
 * citation stays in this list so another capture can be requested.
 *
 * @param returnedIds Frames this capture returned, including a cache hit from an earlier run.
 */
function unboundArticleImageTimesBody(
  text: string,
  artifacts: AgentArtifact[],
  runId?: string,
  returnedIds?: HS.HashSet<string>
): number[] {
  const times: number[] = []
  for (const image of claimArticleImages(text, artifacts, runId, returnedIds)) {
    if (image.artifact === undefined && image.time !== null) {
      times.push(image.time)
    }
  }
  return orderedUnique(times)
}

/** Collect screenshot ids cited as `artifact:uuid` or a bare uuid. */
function citedArtifactIdsBody(text: string, artifacts: AgentArtifact[] = []): string[] {
  const ids: string[] = []
  for (const match of Str.matchAll(AGENT_MARKDOWN_MEDIA)(text)) {
    const id = artifactIdFromUrlBody(match[3] ?? '', artifacts)
    if (id !== undefined && id.length > 0) {
      ids.push(id)
    }
  }
  return ids
}

/** MIME type for a stored screenshot or clip poster.
 *
 * **Example** (Access the artifactImageMime contract)
 *
 * ```ts
 * import { artifactImageMime } from './agent-markdown.js'
 * void artifactImageMime
 * ```
 *
 * @category utilities
 * @since 0.0.0
 */
export function artifactImageMime(artifact: AgentArtifact): string {
  const file = (artifact.kind === 'image' ? artifact.path : artifact.posterPath) || artifact.name
  const extension = Str.split('.')(file).pop()
  const ext = extension === undefined ? undefined : Str.toLowerCase(extension)
  return ext === 'png'
    ? 'image/png'
    : ext === 'webp'
      ? 'image/webp'
      : ext === 'gif'
        ? 'image/gif'
        : 'image/jpeg'
}

/**
 * Replace cited artifact images and clip posters with standalone data URIs.
 *
 * @param markdown Reply body that still uses `artifact:` ids.
 * @param dataUrisById Lowercase artifact id → `data:image/...;base64,...`.
 * @param artifacts Thread attachments, used to resolve truncated ids.
 */
function embedArtifactDataUrisBody(
  markdown: string,
  dataUrisById: HM.HashMap<string, string>,
  artifacts: AgentArtifact[] = []
): string {
  if (HM.size(dataUrisById) === 0) {
    return markdown
  }
  AGENT_MARKDOWN_MEDIA.lastIndex = 0
  const parts: string[] = []
  let position = 0
  for (const match of Str.matchAll(AGENT_MARKDOWN_MEDIA)(markdown)) {
    const raw = match[0]
    const alt = match[2] ?? ''
    const url = match[3] ?? ''
    const index = match.index ?? 0
    const id = artifactIdFromUrlBody(url, artifacts)
    const dataUri =
      id !== undefined && id.length > 0 ? O.getOrUndefined(HM.get(dataUrisById, id)) : undefined
    parts.push(
      Str.slice(position, index)(markdown),
      dataUri !== undefined && dataUri.length > 0 ? `![${alt}](${dataUri})` : raw
    )
    position = index + raw.length
  }
  AGENT_MARKDOWN_MEDIA.lastIndex = 0
  parts.push(Str.slice(position)(markdown))
  return A.join(parts, '')
}

/**
 * Read cited screenshots and rewrite markdown so exports no longer depend on `artifact:` URLs.
 *
 * @param markdown Reply body.
 * @param artifacts Thread attachments with real filesystem paths.
 * @param readImage Returns raw base64 bytes for one screenshot or clip poster.
 */
/** Image reads are explicit effects; legacy Promise callbacks are adapted outside shared.
 * @category services
 * @since 0.0.0
 *
 * **Example** (Access the ImageReader contract)
 *
 * ```ts
 * import { ImageReader } from './agent-markdown.js'
 * void ImageReader
 * ```
 *
 */
export class ImageReader extends Context.Service<
  ImageReader,
  {
    readonly readImage: (artifact: AgentArtifact) => Effect.Effect<string, SharedOperationError>
  }
>()('vidbee/shared/agent-markdown/ImageReader') {}
/** Embed images concurrently, swallowing individual read failures as the old API does.
 *
 * **Example** (Access the embedArtifactImages contract)
 *
 * ```ts
 * import { embedArtifactImages } from './agent-markdown.js'
 * void embedArtifactImages
 * ```
 *
 * @category commands
 * @since 0.0.0
 */
export const embedArtifactImages = Effect.fn('shared.embedArtifactImages')(function* (input: {
  markdown: string
  artifacts: AgentArtifact[]
}) {
  const { markdown, artifacts } = input
  const ids = orderedUnique(citedArtifactIdsBody(markdown, artifacts))
  if (ids.length === 0) {
    return markdown
  }
  const reader = yield* ImageReader
  let byId = HM.empty<string, AgentArtifact>()
  for (const item of artifacts) {
    byId = HM.set(byId, Str.toLowerCase(item.id), item)
  }
  const pairs = yield* Effect.forEach(
    ids,
    Effect.fn('shared.agent-markdown')(function* (id: string) {
      const artifact = O.getOrUndefined(HM.get(byId, id))
      if (artifact === undefined) {
        return O.none<readonly [string, string]>()
      }
      const base64 = yield* reader.readImage(artifact).pipe(Effect.orElseSucceed(() => ''))
      return yield* Effect.try({
        try: () =>
          P.isTruthy(base64)
            ? O.some([id, `data:${artifactImageMime(artifact)};base64,${base64}`] as const)
            : O.none<readonly [string, string]>(),
        catch: () => SharedOperationError.make({ message: 'Image embedding failed' })
      }).pipe(Effect.orElseSucceed(() => O.none<readonly [string, string]>()))
    }),
    {
      concurrency: 'unbounded'
    }
  )
  const dataUris = HM.fromIterable(A.getSomes(pairs))
  return embedArtifactDataUrisBody(markdown, dataUris, artifacts)
})

/** Keep this reply's media plus any screenshot it cites from an earlier version. */
function artifactsForMessageBody(
  artifacts: AgentArtifact[],
  text: string,
  branchRunIds: Iterable<string | null | undefined>
): AgentArtifact[] {
  const runs = HS.fromIterable(branchRunIds)
  const cited = HS.fromIterable(citedArtifactIdsBody(text, artifacts))
  return Sparse.filter({
    items: artifacts,
    predicate: (item) => HS.has(runs, item.runId) || HS.has(cited, Str.toLowerCase(item.id))
  })
}

/** Render selected inline media, falling back to run attachments only when none are selected. */
function splitAgentResponseMediaBody(
  text: string,
  artifacts: AgentArtifact[],
  ownRunId?: string,
  includeUncited = true
): AgentResponsePart[] {
  const parts: AgentResponsePart[] = []
  const used = {
    value: HS.empty<string>()
  }
  let position = 0
  for (const match of Str.matchAll(AGENT_MARKDOWN_MEDIA)(text)) {
    const [raw = '', bang = '', alt = '', url = ''] = match
    const index = match.index ?? 0
    const image = bang === '!'
    const { artifact } = claimArticleArtifact(artifacts, used, alt, url, ownRunId, image)
    if (!(image || artifact !== undefined)) {
      continue
    }
    if (index > position) {
      parts.push({
        key: `text-${position}`,
        text: Str.slice(position, index)(text)
      })
    }
    if (artifact === undefined) {
      parts.push({
        key: `image-${index}`,
        text: Str.trim(alt)
      })
    } else {
      parts.push({
        key: `${artifact.id}-${index}`,
        artifact,
        caption: alt
      })
    }
    position = index + raw.length
  }
  if (position < text.length) {
    parts.push({
      key: `text-${position}`,
      text: Str.slice(position)(text)
    })
  }
  if (includeUncited && HS.size(used.value) === 0) {
    for (const artifact of artifacts) {
      if (artifact.runId === ownRunId) {
        parts.push({
          key: artifact.id,
          artifact
        })
      }
    }
  }
  return parts
}
const orderedUnique = <A>(values: Iterable<A>): A[] => {
  let seen = HS.empty<A>()
  const ordered: A[] = []
  for (const value of values) {
    if (!HS.has(seen, value)) {
      seen = HS.add(seen, value)
      ordered.push(value)
    }
  }
  return ordered
}

/** AgentResponsePart shared data; structural for legacy construction.
 *
 * **Example** (Reject invalid AgentResponsePart input)
 *
 * ```ts
 * import { strictEqual } from 'node:assert'
 * import * as S from 'effect/Schema'
 * import { AgentResponsePart } from './agent-markdown.js'
 * strictEqual(S.is(AgentResponsePart)(Symbol.for('invalid-model')), false)
 * ```
 *
 * @category schemas
 * @since 0.0.0
 */
export const AgentResponsePart = S.Struct({
  key: S.String.pipe(S.mutableKey),
  text: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  artifact: AgentArtifact.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  caption: S.String.pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('AgentResponsePart', {
    description: 'AgentResponsePart shared boundary data.'
  })
)
/** Decoded mutable AgentResponsePart data.
 * @category type-level
 * @since 0.0.0
 *
 * **Example** (Access the AgentResponsePart contract)
 *
 * ```ts
 * import { AgentResponsePart } from './agent-markdown.js'
 * void AgentResponsePart
 * ```
 *
 */
export type AgentResponsePart = typeof AgentResponsePart.Type
/** Record contract for artifactIdFromUrl. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the ArtifactIdFromUrlInput contract)
 *
 * ```ts
 * import { ArtifactIdFromUrlInput } from './agent-markdown.js'
 * void ArtifactIdFromUrlInput
 * ```
 *
 */
export const ArtifactIdFromUrlInput = S.Struct({
  url: S.mutableKey(S.String),
  artifacts: S.Union([AgentArtifact.pipe(S.Array, S.mutable), S.Undefined]).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  )
}).pipe(
  $I.annoteSchema('ArtifactIdFromUrlInput', {
    description:
      'Explicit input record for ArtifactIdFromUrlInput; structural for legacy construction.'
  })
)
/** Schema-derived ArtifactIdFromUrlInput input.
 * @category type-level
 * @since 0.0.0
 */
export type ArtifactIdFromUrlInput = typeof ArtifactIdFromUrlInput.Type
/** artifactIdFromUrl with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the artifactIdFromUrl contract)
 *
 * ```ts
 * import { artifactIdFromUrl } from './agent-markdown.js'
 * void artifactIdFromUrl
 * ```
 *
 */
export const artifactIdFromUrl: {
  (): (input: ArtifactIdFromUrlInput) => O.Option<string>
  (input: ArtifactIdFromUrlInput): O.Option<string>
} = recordFunction(
  (input: ArtifactIdFromUrlInput): O.Option<string> =>
    O.fromNullishOr(artifactIdFromUrlBody(input.url, input.artifacts))
)
/** Record contract for clockFromImage. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the ClockFromImageInput contract)
 *
 * ```ts
 * import { ClockFromImageInput } from './agent-markdown.js'
 * void ClockFromImageInput
 * ```
 *
 */
export const ClockFromImageInput = S.Struct({
  alt: S.mutableKey(S.String),
  url: S.mutableKey(S.String)
}).pipe(
  $I.annoteSchema('ClockFromImageInput', {
    description:
      'Explicit input record for ClockFromImageInput; structural for legacy construction.'
  })
)
/** Schema-derived ClockFromImageInput input.
 * @category type-level
 * @since 0.0.0
 */
export type ClockFromImageInput = typeof ClockFromImageInput.Type
/** clockFromImage with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the clockFromImage contract)
 *
 * ```ts
 * import { clockFromImage } from './agent-markdown.js'
 * void clockFromImage
 * ```
 *
 */
export const clockFromImage: {
  (): (input: ClockFromImageInput) => O.Option<number>
  (input: ClockFromImageInput): O.Option<number>
} = recordFunction(
  (input: ClockFromImageInput): O.Option<number> =>
    O.fromNullishOr(clockFromImageBody(input.alt, input.url))
)
/** Record contract for matchArtifactByClock. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the MatchArtifactByClockInput contract)
 *
 * ```ts
 * import { MatchArtifactByClockInput } from './agent-markdown.js'
 * void MatchArtifactByClockInput
 * ```
 *
 */
export const MatchArtifactByClockInput = S.Struct({
  artifacts: AgentArtifact.pipe(S.Array, S.mutable, S.mutableKey),
  used: S.String.pipe(S.HashSet, S.mutableKey),
  time: S.mutableKey(S.Union([S.Finite, S.Null])),
  runId: S.Union([S.String, S.Undefined]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  returnedIds: S.Union([S.HashSet(S.String), S.Undefined]).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  )
}).pipe(
  $I.annoteSchema('MatchArtifactByClockInput', {
    description:
      'Explicit input record for MatchArtifactByClockInput; structural for legacy construction.'
  })
)
/** Schema-derived MatchArtifactByClockInput input.
 * @category type-level
 * @since 0.0.0
 */
export type MatchArtifactByClockInput = typeof MatchArtifactByClockInput.Type
/** matchArtifactByClock with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the matchArtifactByClock contract)
 *
 * ```ts
 * import { matchArtifactByClock } from './agent-markdown.js'
 * void matchArtifactByClock
 * ```
 *
 */
export const matchArtifactByClock: {
  (): (input: MatchArtifactByClockInput) => O.Option<AgentArtifact>
  (input: MatchArtifactByClockInput): O.Option<AgentArtifact>
} = recordFunction(
  (input: MatchArtifactByClockInput): O.Option<AgentArtifact> =>
    O.fromNullishOr(
      matchArtifactByClockBody(
        input.artifacts,
        input.used,
        input.time,
        input.runId,
        input.returnedIds
      )
    )
)
/** Record contract for bindArticleImageArtifacts. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the BindArticleImageArtifactsInput contract)
 *
 * ```ts
 * import { BindArticleImageArtifactsInput } from './agent-markdown.js'
 * void BindArticleImageArtifactsInput
 * ```
 *
 */
export const BindArticleImageArtifactsInput = S.Struct({
  text: S.mutableKey(S.String),
  artifacts: AgentArtifact.pipe(S.Array, S.mutable, S.mutableKey),
  runId: S.mutableKey(S.String),
  returnedIds: S.Union([S.HashSet(S.String), S.Undefined]).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  )
}).pipe(
  $I.annoteSchema('BindArticleImageArtifactsInput', {
    description:
      'Explicit input record for BindArticleImageArtifactsInput; structural for legacy construction.'
  })
)
/** Schema-derived BindArticleImageArtifactsInput input.
 * @category type-level
 * @since 0.0.0
 */
export type BindArticleImageArtifactsInput = typeof BindArticleImageArtifactsInput.Type
/** bindArticleImageArtifacts with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the bindArticleImageArtifacts contract)
 *
 * ```ts
 * import { bindArticleImageArtifacts } from './agent-markdown.js'
 * void bindArticleImageArtifacts
 * ```
 *
 */
export const bindArticleImageArtifacts: {
  (): (input: BindArticleImageArtifactsInput) => string
  (input: BindArticleImageArtifactsInput): string
} = recordFunction((input: BindArticleImageArtifactsInput): string =>
  bindArticleImageArtifactsBody(input.text, input.artifacts, input.runId, input.returnedIds)
)
/** Record contract for unboundArticleImageTimes. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the UnboundArticleImageTimesInput contract)
 *
 * ```ts
 * import { UnboundArticleImageTimesInput } from './agent-markdown.js'
 * void UnboundArticleImageTimesInput
 * ```
 *
 */
export const UnboundArticleImageTimesInput = S.Struct({
  text: S.mutableKey(S.String),
  artifacts: AgentArtifact.pipe(S.Array, S.mutable, S.mutableKey),
  runId: S.Union([S.String, S.Undefined]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  returnedIds: S.Union([S.HashSet(S.String), S.Undefined]).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  )
}).pipe(
  $I.annoteSchema('UnboundArticleImageTimesInput', {
    description:
      'Explicit input record for UnboundArticleImageTimesInput; structural for legacy construction.'
  })
)
/** Schema-derived UnboundArticleImageTimesInput input.
 * @category type-level
 * @since 0.0.0
 */
export type UnboundArticleImageTimesInput = typeof UnboundArticleImageTimesInput.Type
/** unboundArticleImageTimes with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the unboundArticleImageTimes contract)
 *
 * ```ts
 * import { unboundArticleImageTimes } from './agent-markdown.js'
 * void unboundArticleImageTimes
 * ```
 *
 */
export const unboundArticleImageTimes: {
  (): (input: UnboundArticleImageTimesInput) => number[]
  (input: UnboundArticleImageTimesInput): number[]
} = recordFunction((input: UnboundArticleImageTimesInput): number[] =>
  unboundArticleImageTimesBody(input.text, input.artifacts, input.runId, input.returnedIds)
)
/** Record contract for citedArtifactIds. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the CitedArtifactIdsInput contract)
 *
 * ```ts
 * import { CitedArtifactIdsInput } from './agent-markdown.js'
 * void CitedArtifactIdsInput
 * ```
 *
 */
export const CitedArtifactIdsInput = S.Struct({
  text: S.mutableKey(S.String),
  artifacts: S.Union([AgentArtifact.pipe(S.Array, S.mutable), S.Undefined]).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  )
}).pipe(
  $I.annoteSchema('CitedArtifactIdsInput', {
    description:
      'Explicit input record for CitedArtifactIdsInput; structural for legacy construction.'
  })
)
/** Schema-derived CitedArtifactIdsInput input.
 * @category type-level
 * @since 0.0.0
 */
export type CitedArtifactIdsInput = typeof CitedArtifactIdsInput.Type
/** citedArtifactIds with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the citedArtifactIds contract)
 *
 * ```ts
 * import { citedArtifactIds } from './agent-markdown.js'
 * void citedArtifactIds
 * ```
 *
 */
export const citedArtifactIds: {
  (): (input: CitedArtifactIdsInput) => string[]
  (input: CitedArtifactIdsInput): string[]
} = recordFunction((input: CitedArtifactIdsInput): string[] =>
  citedArtifactIdsBody(input.text, input.artifacts)
)
/** Record contract for embedArtifactDataUris. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the EmbedArtifactDataUrisInput contract)
 *
 * ```ts
 * import { EmbedArtifactDataUrisInput } from './agent-markdown.js'
 * void EmbedArtifactDataUrisInput
 * ```
 *
 */
export const EmbedArtifactDataUrisInput = S.Struct({
  markdown: S.mutableKey(S.String),
  dataUrisById: S.mutableKey(S.HashMap(S.String, S.String)),
  artifacts: S.Union([AgentArtifact.pipe(S.Array, S.mutable), S.Undefined]).pipe(
    S.UndefinedOr,
    S.optionalKey,
    S.mutableKey
  )
}).pipe(
  $I.annoteSchema('EmbedArtifactDataUrisInput', {
    description:
      'Explicit input record for EmbedArtifactDataUrisInput; structural for legacy construction.'
  })
)
/** Schema-derived EmbedArtifactDataUrisInput input.
 * @category type-level
 * @since 0.0.0
 */
export type EmbedArtifactDataUrisInput = typeof EmbedArtifactDataUrisInput.Type
/** embedArtifactDataUris with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the embedArtifactDataUris contract)
 *
 * ```ts
 * import { embedArtifactDataUris } from './agent-markdown.js'
 * void embedArtifactDataUris
 * ```
 *
 */
export const embedArtifactDataUris: {
  (): (input: EmbedArtifactDataUrisInput) => string
  (input: EmbedArtifactDataUrisInput): string
} = recordFunction((input: EmbedArtifactDataUrisInput): string =>
  embedArtifactDataUrisBody(input.markdown, input.dataUrisById, input.artifacts)
)
/** Record contract for artifactsForMessage.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Import the ArtifactsForMessageInput contract)
 *
 * ```ts
 * export type { ArtifactsForMessageInput } from './agent-markdown.js'
 * ```
 *
 */
export interface ArtifactsForMessageInput {
  artifacts: AgentArtifact[]
  text: string
  branchRunIds: Iterable<string | null | undefined>
}
/** artifactsForMessage with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the artifactsForMessage contract)
 *
 * ```ts
 * import { artifactsForMessage } from './agent-markdown.js'
 * void artifactsForMessage
 * ```
 *
 */
export const artifactsForMessage: {
  (): (input: ArtifactsForMessageInput) => AgentArtifact[]
  (input: ArtifactsForMessageInput): AgentArtifact[]
} = recordFunction((input: ArtifactsForMessageInput): AgentArtifact[] =>
  artifactsForMessageBody(input.artifacts, input.text, input.branchRunIds)
)
/** Record contract for splitAgentResponseMedia. structural for legacy construction.
 * @category ports
 * @since 0.0.0
 *
 * **Example** (Access the SplitAgentResponseMediaInput contract)
 *
 * ```ts
 * import { SplitAgentResponseMediaInput } from './agent-markdown.js'
 * void SplitAgentResponseMediaInput
 * ```
 *
 */
export const SplitAgentResponseMediaInput = S.Struct({
  text: S.mutableKey(S.String),
  artifacts: AgentArtifact.pipe(S.Array, S.mutable, S.mutableKey),
  ownRunId: S.Union([S.String, S.Undefined]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey),
  includeUncited: S.Union([S.Boolean, S.Undefined]).pipe(S.UndefinedOr, S.optionalKey, S.mutableKey)
}).pipe(
  $I.annoteSchema('SplitAgentResponseMediaInput', {
    description:
      'Explicit input record for SplitAgentResponseMediaInput; structural for legacy construction.'
  })
)
/** Schema-derived SplitAgentResponseMediaInput input.
 * @category type-level
 * @since 0.0.0
 */
export type SplitAgentResponseMediaInput = typeof SplitAgentResponseMediaInput.Type
/** splitAgentResponseMedia with an explicit record and zero-argument pipeable form.
 * @category utilities
 * @since 0.0.0
 *
 * **Example** (Access the splitAgentResponseMedia contract)
 *
 * ```ts
 * import { splitAgentResponseMedia } from './agent-markdown.js'
 * void splitAgentResponseMedia
 * ```
 *
 */
export const splitAgentResponseMedia: {
  (): (input: SplitAgentResponseMediaInput) => AgentResponsePart[]
  (input: SplitAgentResponseMediaInput): AgentResponsePart[]
} = recordFunction((input: SplitAgentResponseMediaInput): AgentResponsePart[] =>
  splitAgentResponseMediaBody(input.text, input.artifacts, input.ownRunId, input.includeUncited)
)
