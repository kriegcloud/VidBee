import * as Native from '../../shared/agent-markdown'
import {
  AGENT_MARKDOWN_MEDIA as ReexportAGENT_MARKDOWN_MEDIA,
  type AgentResponsePart as ReexportAgentResponsePart,
  ARTIFACT_REFERENCE as ReexportARTIFACT_REFERENCE,
  type ArtifactIdFromUrlInput as ReexportArtifactIdFromUrlInput,
  type ArtifactsForMessageInput as ReexportArtifactsForMessageInput,
  artifactImageMime as ReexportartifactImageMime,
  type BindArticleImageArtifactsInput as ReexportBindArticleImageArtifactsInput,
  type CitedArtifactIdsInput as ReexportCitedArtifactIdsInput,
  type ClockFromImageInput as ReexportClockFromImageInput,
  type EmbedArtifactDataUrisInput as ReexportEmbedArtifactDataUrisInput,
  ImageReader as ReexportImageReader,
  type MatchArtifactByClockInput as ReexportMatchArtifactByClockInput,
  type SplitAgentResponseMediaInput as ReexportSplitAgentResponseMediaInput,
  type UnboundArticleImageTimesInput as ReexportUnboundArticleImageTimesInput
} from '../../shared/agent-markdown'

export {
  ReexportAGENT_MARKDOWN_MEDIA as AGENT_MARKDOWN_MEDIA,
  type ReexportAgentResponsePart as AgentResponsePart,
  ReexportARTIFACT_REFERENCE as ARTIFACT_REFERENCE,
  type ReexportArtifactIdFromUrlInput as ArtifactIdFromUrlInput,
  type ReexportArtifactsForMessageInput as ArtifactsForMessageInput,
  ReexportartifactImageMime as artifactImageMime,
  type ReexportBindArticleImageArtifactsInput as BindArticleImageArtifactsInput,
  type ReexportCitedArtifactIdsInput as CitedArtifactIdsInput,
  type ReexportClockFromImageInput as ClockFromImageInput,
  type ReexportEmbedArtifactDataUrisInput as EmbedArtifactDataUrisInput,
  ReexportImageReader as ImageReader,
  type ReexportMatchArtifactByClockInput as MatchArtifactByClockInput,
  type ReexportSplitAgentResponseMediaInput as SplitAgentResponseMediaInput,
  type ReexportUnboundArticleImageTimesInput as UnboundArticleImageTimesInput
}

import * as Effect from 'effect/Effect'
import * as HM from 'effect/HashMap'
import * as HS from 'effect/HashSet'
import type { AgentArtifact } from '../../shared/AgentAttachment.model'
import { SharedOperationError } from '../../shared/AgentFailure.model'
import type { AgentResponsePart } from '../../shared/agent-markdown'
export function artifactIdFromUrl(
  url: string,
  artifacts: AgentArtifact[] = []
): string | undefined {
  return Native.artifactIdFromUrl({
    url,
    artifacts
  })
}
export function clockFromImage(alt: string, url: string): number | null {
  return Native.clockFromImage({
    alt,
    url
  })
}
export function matchArtifactByClock(
  artifacts: AgentArtifact[],
  used: Set<string>,
  time: number | null,
  runId?: string,
  returnedIds?: ReadonlySet<string>
): AgentArtifact | undefined {
  return Native.matchArtifactByClock({
    artifacts,
    used: HS.fromIterable(used),
    time,
    runId,
    returnedIds: returnedIds === undefined ? undefined : HS.fromIterable(returnedIds)
  })
}
export function bindArticleImageArtifacts(
  text: string,
  artifacts: AgentArtifact[],
  runId: string,
  returnedIds?: ReadonlySet<string>
): string {
  return Native.bindArticleImageArtifacts({
    text,
    artifacts,
    runId,
    returnedIds: returnedIds === undefined ? undefined : HS.fromIterable(returnedIds)
  })
}
export function unboundArticleImageTimes(
  text: string,
  artifacts: AgentArtifact[],
  runId?: string,
  returnedIds?: ReadonlySet<string>
): number[] {
  return Native.unboundArticleImageTimes({
    text,
    artifacts,
    runId,
    returnedIds: returnedIds === undefined ? undefined : HS.fromIterable(returnedIds)
  })
}
export function citedArtifactIds(text: string, artifacts: AgentArtifact[] = []): string[] {
  return Native.citedArtifactIds({
    text,
    artifacts
  })
}
export function embedArtifactDataUris(
  markdown: string,
  dataUrisById: ReadonlyMap<string, string>,
  artifacts: AgentArtifact[] = []
): string {
  return Native.embedArtifactDataUris({
    markdown,
    dataUrisById: HM.fromIterable(dataUrisById),
    artifacts
  })
}
export function artifactsForMessage(
  artifacts: AgentArtifact[],
  text: string,
  branchRunIds: Iterable<string | null | undefined>
): AgentArtifact[] {
  return Native.artifactsForMessage({
    artifacts,
    text,
    branchRunIds
  })
}
export function splitAgentResponseMedia(
  text: string,
  artifacts: AgentArtifact[],
  ownRunId?: string,
  includeUncited = true
): AgentResponsePart[] {
  return Native.splitAgentResponseMedia({
    text,
    artifacts,
    ownRunId,
    includeUncited
  })
}
export function embedArtifactImages(
  markdown: string,
  artifacts: AgentArtifact[],
  readImage: (artifact: AgentArtifact) => Promise<string>
): Promise<string> {
  return Effect.runPromise(
    Native.embedArtifactImages({
      markdown,
      artifacts
    }).pipe(
      Effect.provideService(Native.ImageReader, {
        readImage: (artifact) =>
          Effect.tryPromise({
            try: () => Promise.resolve(readImage(artifact)),
            catch: () => SharedOperationError.make({ message: 'Image read failed' })
          })
      })
    )
  )
}
