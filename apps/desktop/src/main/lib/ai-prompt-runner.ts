import { Agent, type AgentEvent, type AgentMessage } from '@earendil-works/pi-agent-core'
import {
  type Api,
  clampThinkingLevel,
  contentText,
  type Model,
  type ModelThinkingLevel
} from '@earendil-works/pi-ai'
import { streamSimple } from '@earendil-works/pi-ai/compat'
import { BrowserWindow } from 'electron'
import { aiProviderNeedsApiKey } from '../../shared/ai-presets'
import { resolveAiPromptContent } from '../../shared/ai-prompts'
import { classifyAiPromptError, idlePromptRunSnapshot } from '../../shared/ai-run'
import type {
  AiPromptErrorCode,
  AiPromptRunInput,
  AiPromptRunSnapshot
} from '../../shared/ai-types'
import { scopedLoggers } from '../utils/logger'
import { resolvePiModel } from './ai-model'
import { loadPersistedPromptRun, savePersistedPromptRun } from './ai-prompt-store'
import { aiStore } from './ai-store'

const log = scopedLoggers.ai
const PROMPT_RUN_CHANNEL = 'ai:prompt-run'
const STREAM_FLUSH_MS = 50
const SYSTEM_PROMPT = [
  "You are VidBee's transcript assistant. Follow the instruction exactly.",
  'Reply in Markdown. Use the same language as the transcript unless the instruction says otherwise.',
  'Keep each list marker on the same line as the item text.',
  'Do not wrap the whole reply in a code fence unless the instruction asks for a mermaid diagram. Do not add a preamble or closing remarks.'
].join(' ')

export interface PromptAgentLike {
  abort: () => void
  prompt: (text: string) => Promise<void>
  subscribe: (listener: (event: AgentEvent) => void) => () => void
}

export interface PromptRunDeps {
  createAgent: (input: {
    systemPrompt: string
    model: Model<Api>
    apiKey: string
    thinkingLevel?: ModelThinkingLevel
  }) => PromptAgentLike
  getActiveProvider: () => ReturnType<typeof aiStore.getActiveProviderSecret>
  getPrompt: (id: string) => ReturnType<typeof aiStore.getPrompt>
  now: () => number
  broadcast: (snapshot: AiPromptRunSnapshot) => void
}

interface ActiveRun {
  agent: PromptAgentLike
  snapshot: AiPromptRunSnapshot
  unsubscribe: () => void
  lastBroadcastAt: number
  broadcast: (snapshot: AiPromptRunSnapshot) => void
  discarded: boolean
}

const runs = new Map<string, ActiveRun>()

/**
 * Build the map key for a prompt run so leaving a page does not lose the stream.
 *
 * @param downloadId Download or settings-test id.
 * @param promptId Prompt id.
 */
export const promptRunKey = (downloadId: string, promptId: string): string =>
  `${downloadId}::${promptId}`

export { idlePromptRunSnapshot }

const noopAgent: PromptAgentLike = {
  abort: () => undefined,
  prompt: async () => undefined,
  subscribe: () => () => undefined
}

const SUCCESS_STOP_REASONS = new Set(['stop', 'end_turn', 'length', 'toolUse', 'tool_use'])

/**
 * Pull visible answer text out of an assistant message. Thinking is separate.
 *
 * @param message Agent message from a stream event.
 */
export const assistantTextFromMessage = (message: AgentMessage): string => {
  if (message.role !== 'assistant') {
    return ''
  }
  const content = message.content as unknown
  if (typeof content === 'string') {
    return content.trim()
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return contentText(content).trim()
}

/**
 * Pull reasoning blocks out of an assistant message for ThinkingSteps.
 *
 * @param message Agent message from a stream event.
 */
export const assistantThinkingFromMessage = (message: AgentMessage): string => {
  if (message.role !== 'assistant') {
    return ''
  }
  const content = message.content
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((block) => {
      const record = block as { type?: string; thinking?: string }
      if (record.type === 'thinking' && record.thinking) {
        return record.thinking
      }
      return ''
    })
    .filter((part) => part.length > 0)
    .join('\n')
    .trim()
}

/**
 * Prefer streamed text; if the model only returned thinking, use that as the answer.
 *
 * @param text Visible assistant text.
 * @param thinking Reasoning text.
 */
export const assistantAnswerFromParts = (text: string, thinking: string): string => {
  const nextText = text.trim()
  if (nextText) {
    return nextText
  }
  return thinking.trim()
}

/**
 * Advance the reasoning clock, which stops once visible answer text arrives.
 *
 * A model that streams nothing before its final message reports no reasoning
 * window at all, so that case falls back to the whole run duration.
 *
 * @param previous Milliseconds recorded so far.
 * @param elapsed Milliseconds since the run started.
 * @param thinking Reasoning text received so far.
 * @param text Visible answer text received so far.
 */
export const thinkingElapsedMs = (
  previous: number,
  elapsed: number,
  thinking: string,
  text: string
): number => {
  if (!thinking.trim()) {
    return previous
  }
  if (previous === 0 || !text.trim()) {
    return elapsed
  }
  return previous
}

/**
 * Read a real provider failure from an assistant message.
 *
 * Normal completions use stopReason "stop". That is not an error.
 *
 * @param message Agent message from a stream event.
 */
export const assistantErrorFromMessage = (message: AgentMessage): string | null => {
  if (message.role !== 'assistant') {
    return null
  }
  const record = message as {
    diagnostics?: Array<{
      error?: { message?: string; code?: string | number }
      details?: Record<string, unknown>
    }>
    errorMessage?: unknown
    rawStopReason?: unknown
    stopReason?: unknown
  }
  const stopReason = typeof record.stopReason === 'string' ? record.stopReason : ''
  const rawStopReason = typeof record.rawStopReason === 'string' ? record.rawStopReason.trim() : ''
  const parts: string[] = []
  if (typeof record.errorMessage === 'string' && record.errorMessage.trim()) {
    parts.push(record.errorMessage.trim())
  }
  if (Array.isArray(record.diagnostics)) {
    for (const item of record.diagnostics) {
      if (item.error?.message) {
        parts.push(item.error.message)
      }
      const status = item.details?.status ?? item.details?.statusCode
      if (status !== undefined) {
        parts.push(`HTTP ${String(status)}`)
      }
      const body = item.details?.body ?? item.details?.response ?? item.details?.data
      if (typeof body === 'string' && body.trim()) {
        parts.push(body.trim().slice(0, 500))
      } else if (body && typeof body === 'object') {
        parts.push(JSON.stringify(body).slice(0, 500))
      }
    }
  }
  if (parts.length > 0) {
    return [...new Set(parts)].join('\n')
  }
  if (SUCCESS_STOP_REASONS.has(stopReason) || SUCCESS_STOP_REASONS.has(rawStopReason)) {
    return null
  }
  if (stopReason === 'error' || stopReason === 'aborted') {
    return rawStopReason && !SUCCESS_STOP_REASONS.has(rawStopReason)
      ? rawStopReason
      : 'The model request failed'
  }
  return null
}

/**
 * Build a failed run snapshot and remember it so remounts keep the guidance.
 *
 * @param input Download and prompt ids.
 * @param error Human-readable failure.
 * @param errorCode Guidance code.
 * @param now Timestamp.
 * @param broadcast Renderer fan-out.
 */
const failRun = (
  input: { downloadId: string; promptId: string },
  error: string,
  errorCode: AiPromptErrorCode,
  now: number,
  broadcast: (snapshot: AiPromptRunSnapshot) => void
): AiPromptRunSnapshot => {
  const snapshot: AiPromptRunSnapshot = {
    downloadId: input.downloadId,
    promptId: input.promptId,
    status: 'error',
    text: '',
    thinking: '',
    thinkingMs: 0,
    error,
    errorCode,
    updatedAt: now
  }
  const previous = runs.get(promptRunKey(input.downloadId, input.promptId))
  previous?.unsubscribe()
  runs.set(promptRunKey(input.downloadId, input.promptId), {
    agent: noopAgent,
    snapshot,
    unsubscribe: () => undefined,
    lastBroadcastAt: now,
    broadcast,
    discarded: false
  })
  savePersistedPromptRun(snapshot)
  broadcast(snapshot)
  log.warn('ai prompt run failed', {
    downloadId: input.downloadId,
    promptId: input.promptId,
    error,
    errorCode
  })
  return snapshot
}

/**
 * Send a run snapshot to every renderer window.
 *
 * @param snapshot Latest run state.
 */
const broadcastPromptRun = (snapshot: AiPromptRunSnapshot): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(PROMPT_RUN_CHANNEL, snapshot)
    }
  }
}

/**
 * Create a pi-agent bound to one provider and one system prompt.
 *
 * @param input Model, API key, and instruction.
 */
export const createPiPromptAgent = (input: {
  systemPrompt: string
  model: Model<Api>
  apiKey: string
  thinkingLevel?: ModelThinkingLevel
}): PromptAgentLike => {
  const agent = new Agent({
    streamFn: streamSimple,
    getApiKey: () => input.apiKey || undefined,
    initialState: {
      systemPrompt: input.systemPrompt,
      model: input.model,
      thinkingLevel: input.thinkingLevel ?? 'off',
      tools: [],
      messages: []
    }
  })
  return {
    abort: () => agent.abort(),
    prompt: (text) => agent.prompt(text),
    subscribe: (listener) => agent.subscribe(listener)
  }
}

const defaultDeps: PromptRunDeps = {
  createAgent: createPiPromptAgent,
  getActiveProvider: () => aiStore.getActiveProviderSecret(),
  getPrompt: (id) => aiStore.getPrompt(id),
  now: () => Date.now(),
  broadcast: broadcastPromptRun
}

/**
 * Remember a restored snapshot in the in-memory map so later reads stay in process.
 *
 * @param snapshot Terminal result loaded from SQLite.
 */
const hydratePersistedRun = (snapshot: AiPromptRunSnapshot): void => {
  runs.set(promptRunKey(snapshot.downloadId, snapshot.promptId), {
    agent: noopAgent,
    snapshot,
    unsubscribe: () => undefined,
    lastBroadcastAt: snapshot.updatedAt,
    broadcast: broadcastPromptRun,
    discarded: false
  })
}

/**
 * Return the live snapshot, then the last SQLite result, then idle.
 *
 * @param downloadId Download or settings-test id.
 * @param promptId Prompt id.
 */
export const getPromptRunSnapshot = (downloadId: string, promptId: string): AiPromptRunSnapshot => {
  const live = runs.get(promptRunKey(downloadId, promptId))?.snapshot
  if (live) {
    return live
  }
  const persisted = loadPersistedPromptRun(downloadId, promptId)
  if (persisted) {
    const snapshot: AiPromptRunSnapshot = {
      ...persisted,
      thinking: persisted.thinking ?? '',
      thinkingMs: persisted.thinkingMs ?? 0
    }
    hydratePersistedRun(snapshot)
    return snapshot
  }
  return idlePromptRunSnapshot(downloadId, promptId)
}

/**
 * Stop an in-flight prompt. Navigating away does not call this.
 *
 * @param downloadId Download or settings-test id.
 * @param promptId Prompt id.
 */
export const stopPromptRun = (downloadId: string, promptId: string): AiPromptRunSnapshot => {
  const run = runs.get(promptRunKey(downloadId, promptId))
  if (run?.snapshot.status !== 'running') {
    return run?.snapshot ?? idlePromptRunSnapshot(downloadId, promptId)
  }
  run.agent.abort()
  run.snapshot = {
    ...run.snapshot,
    status: 'aborted',
    updatedAt: Date.now()
  }
  savePersistedPromptRun(run.snapshot)
  run.broadcast(run.snapshot)
  return run.snapshot
}

/**
 * Abort in-flight prompt runs for a download without writing a new result.
 * Used when the parent download is removed so a finishing stream cannot
 * resurrect stored prompt rows.
 *
 * @param downloadId Parent download id.
 */
export const stopPromptRunsForDownload = (downloadId: string): void => {
  for (const [key, run] of runs) {
    if (run.snapshot.downloadId !== downloadId) {
      continue
    }
    run.discarded = true
    runs.delete(key)
    if (run.snapshot.status === 'running') {
      run.agent.abort()
      run.unsubscribe()
    }
  }
}

/**
 * Start a prompt against the active provider. The Agent lives in this module so
 * switching pages does not abort the stream.
 *
 * @param input Transcript text plus prompt and download ids.
 * @param deps Optional test doubles.
 */
export const startPromptRun = (
  input: AiPromptRunInput,
  deps: PromptRunDeps = defaultDeps
): AiPromptRunSnapshot => {
  const prompt = deps.getPrompt(input.promptId)
  if (!prompt) {
    return failRun(input, 'Unknown prompt', 'unknown-prompt', deps.now(), deps.broadcast)
  }
  const transcriptText = input.transcriptText.trim()
  if (!transcriptText) {
    return failRun(input, 'Transcript is empty', 'empty-transcript', deps.now(), deps.broadcast)
  }
  const active = deps.getActiveProvider()
  if (!active) {
    return failRun(input, 'No AI provider is enabled', 'no-provider', deps.now(), deps.broadcast)
  }
  if (aiProviderNeedsApiKey(active.provider.presetId) && !active.apiKey) {
    return failRun(
      input,
      'The enabled provider is missing an API key',
      'missing-api-key',
      deps.now(),
      deps.broadcast
    )
  }
  if (!active.provider.modelId.trim()) {
    return failRun(
      input,
      'The enabled provider is missing a model id',
      'missing-model',
      deps.now(),
      deps.broadcast
    )
  }

  const key = promptRunKey(input.downloadId, input.promptId)
  const previous = runs.get(key)
  if (previous?.snapshot.status === 'running') {
    previous.agent.abort()
    previous.unsubscribe()
  }

  const model = resolvePiModel({
    presetId: active.provider.presetId,
    modelId: active.provider.modelId,
    baseUrl: active.provider.baseUrl
  })
  const instruction = resolveAiPromptContent(prompt.content, input.uiLanguage ?? 'en')
  const systemPrompt = `${SYSTEM_PROMPT}\n\nInstruction:\n${instruction}`
  const agent = deps.createAgent({
    systemPrompt,
    model,
    apiKey: active.apiKey,
    thinkingLevel: clampThinkingLevel(model, 'low')
  })
  const startedAt = deps.now()
  const snapshot: AiPromptRunSnapshot = {
    downloadId: input.downloadId,
    promptId: input.promptId,
    status: 'running',
    text: '',
    thinking: '',
    thinkingMs: 0,
    error: null,
    errorCode: null,
    updatedAt: startedAt
  }
  const run: ActiveRun = {
    agent,
    snapshot,
    unsubscribe: () => undefined,
    lastBroadcastAt: 0,
    broadcast: deps.broadcast,
    discarded: false
  }

  /**
   * Push a snapshot to renderers, throttling token deltas.
   *
   * @param next Latest snapshot.
   * @param force Skip the throttle window.
   */
  const emit = (next: AiPromptRunSnapshot, force: boolean): void => {
    run.snapshot = next
    if (next.status !== 'running') {
      savePersistedPromptRun(next)
    }
    const now = deps.now()
    if (!force && now - run.lastBroadcastAt < STREAM_FLUSH_MS) {
      return
    }
    run.lastBroadcastAt = now
    deps.broadcast(next)
  }

  let lastError: string | null = null
  let lastAssistant: AgentMessage | null = null
  run.unsubscribe = agent.subscribe((event) => {
    if (
      (event.type === 'message_update' ||
        event.type === 'message_end' ||
        event.type === 'turn_end') &&
      event.message.role === 'assistant'
    ) {
      lastAssistant = event.message
      lastError = assistantErrorFromMessage(event.message) ?? lastError
    }
    if (event.type === 'message_update' && event.message.role === 'assistant') {
      const thinking = assistantThinkingFromMessage(event.message)
      const text = assistantTextFromMessage(event.message)
      const now = deps.now()
      emit(
        {
          ...run.snapshot,
          text,
          thinking,
          thinkingMs: thinkingElapsedMs(run.snapshot.thinkingMs, now - startedAt, thinking, text),
          status: 'running',
          updatedAt: now
        },
        false
      )
      return
    }
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const thinking = assistantThinkingFromMessage(event.message) || run.snapshot.thinking
      const text = assistantAnswerFromParts(
        assistantTextFromMessage(event.message) || run.snapshot.text,
        thinking
      )
      const now = deps.now()
      emit(
        {
          ...run.snapshot,
          text,
          thinking,
          thinkingMs: thinkingElapsedMs(run.snapshot.thinkingMs, now - startedAt, thinking, text),
          updatedAt: now
        },
        true
      )
    }
  })

  runs.set(key, run)
  deps.broadcast(snapshot)
  log.info('ai prompt run started', { downloadId: input.downloadId, promptId: input.promptId })

  void agent
    .prompt(transcriptText)
    .then(() => {
      if (run.discarded || run.snapshot.status !== 'running') {
        return
      }
      const text = assistantAnswerFromParts(run.snapshot.text, run.snapshot.thinking)
      const emptyText = text.length === 0
      if (lastError || emptyText) {
        const error = lastError || 'The model returned no text'
        const errorCode = classifyAiPromptError(lastError, emptyText)
        emit(
          {
            ...run.snapshot,
            text,
            status: 'error',
            error,
            errorCode,
            updatedAt: deps.now()
          },
          true
        )
        const assistant = lastAssistant as { stopReason?: unknown; rawStopReason?: unknown } | null
        log.warn('ai prompt run failed', {
          downloadId: input.downloadId,
          promptId: input.promptId,
          error,
          errorCode,
          stopReason: assistant?.stopReason,
          rawStopReason: assistant?.rawStopReason
        })
        return
      }
      emit(
        {
          ...run.snapshot,
          text,
          status: 'completed',
          error: null,
          errorCode: null,
          updatedAt: deps.now()
        },
        true
      )
      log.info('ai prompt run completed', {
        downloadId: input.downloadId,
        promptId: input.promptId
      })
    })
    .catch((error: unknown) => {
      if (run.discarded) {
        return
      }
      if (run.snapshot.status === 'aborted') {
        emit({ ...run.snapshot, updatedAt: deps.now() }, true)
        return
      }
      const message = error instanceof Error ? error.message : 'Prompt failed'
      const errorCode = classifyAiPromptError(message, run.snapshot.text.trim().length === 0)
      emit(
        {
          ...run.snapshot,
          status: 'error',
          error: message,
          errorCode,
          updatedAt: deps.now()
        },
        true
      )
      log.warn('ai prompt run failed', {
        downloadId: input.downloadId,
        promptId: input.promptId,
        error: message,
        errorCode
      })
    })
    .finally(() => {
      run.unsubscribe()
    })

  return snapshot
}
