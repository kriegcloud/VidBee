import * as Pure from "@vidbee/transcription/transcript-sources";
import * as HashMap from 'effect/HashMap';
import * as Option from 'effect/Option';
import type { TranscriptResultKind, TranscriptSourceKind, TranscriptSourceOption } from './types';
export interface TranscriptSourceMeta {
  language: string | null
  resultKind: TranscriptResultKind
  sourceKind: TranscriptSourceKind
}

export interface TranscriptHead extends TranscriptSourceMeta {
  asrTier: string | null
  createdAt: number
  downloadTaskId: string
  id: string
  modelVersion: string
  sourceFilePath: string | null
  supersededAt: number | null
  transcriptionTaskId: string
  updatedAt: number
}

export const buildTranscriptSources = (input: {
  asrActive?: boolean
  current: TranscriptSourceMeta | null
  preferredKey?: string | null
  stored: readonly TranscriptSourceMeta[]
  tracks: ReadonlyArray<{ language: string | null }>
}): TranscriptSourceOption[] => { return Pure.buildTranscriptSources(input); };

export const recordForTranscriptSource = <T extends TranscriptSourceMeta>(
  selected: TranscriptSourceOption | undefined,
  stored: readonly T[],
  fallback: T | null
): T | null => { return Pure.recordForTranscriptSource(selected, stored, fallback); };

export const latestTranscriptHead = <T extends TranscriptHead>(
  heads: readonly T[],
  latestTaskId: string | null
): T | null => { return Pure.latestTranscriptHead(heads, latestTaskId); };

export const resolveTranscriptHeads = <T extends TranscriptHead>(input: {
  asrActive: boolean
  heads: readonly T[]
  latestTaskId: string | null
  preferredKey?: string | null
  tracks: ReadonlyArray<{ language: string | null }>
}): { latest: T | null; selected: T | null; sources: TranscriptSourceOption[] } => { return Pure.resolveTranscriptHeads(input); };

export const groupTranscriptHeads = (
  heads: readonly TranscriptHead[]
): Map<string, TranscriptHead[]> => { const grouped = Pure.groupTranscriptHeads(heads); const ordered = new Map<string, TranscriptHead[]>(); for (const head of heads) { if (ordered.has(head.downloadTaskId)) continue; const rows = HashMap.get(grouped, head.downloadTaskId).pipe(Option.getOrUndefined); if (rows !== undefined) ordered.set(head.downloadTaskId, rows); } return ordered; };

