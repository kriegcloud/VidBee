import { realpathSync } from 'node:fs'
import path from 'node:path'
import type { Task } from '@vidbee/task-queue'
import { type AgentThread, selectedAgentMessages } from '../../shared/agent-chat'
import type { AiPromptRunSnapshot } from '../../shared/ai-types'
import { settingsManager } from '../settings'
import { scopedLoggers } from '../utils/logger'
import { getDatabaseConnection } from './database'
import { markdownWithEmbeddedImages } from './markdown-export'
import { peekDesktopTaskQueueRef } from './queue-ref'
import { resolveTaskSourceFile } from './source-file'
import {
  groupVideoFiles,
  type VideoSkillDocument,
  writeVideoSkillDocument
} from './video-library-files'

const pending = new Map<string, Promise<void>>()
const log = scopedLoggers.ai

/** Serialize grouping and sidecar updates for the same video across all clients. */
function schedule(downloadId: string, action: () => Promise<void>): Promise<void> {
  const work = (pending.get(downloadId) ?? Promise.resolve())
    .then(action)
    .catch((error: unknown) =>
      log.warn('Video folder/Markdown save failed; retrying on next startup', { downloadId, error })
    )
    .finally(() => {
      if (pending.get(downloadId) === work) {
        pending.delete(downloadId)
      }
    })
  pending.set(downloadId, work)
  return work
}

/** Resolve owned library videos and keep imported/external media in their original locations. */
function ownedVideo(task: Readonly<Task>): string | null {
  if (task.kind !== 'video' || task.status !== 'completed') {
    return null
  }
  const source = resolveTaskSourceFile(task)
  if (!source) {
    return null
  }
  const root = settingsManager.get('downloadPath')
  if (typeof root !== 'string' || !root) {
    return null
  }
  const relative = path.relative(realpathSync(root), realpathSync(source))
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? source : null
}

/** Move companions with rollback-safe queue and transcript references, then write final answers. */
async function synchronizeVideo(
  downloadId: string,
  documents: VideoSkillDocument[] = []
): Promise<void> {
  const queue = peekDesktopTaskQueueRef()
  const task = queue?.get(downloadId)
  if (!(queue && task)) {
    return
  }
  const source = ownedVideo(task)
  if (!source) {
    return
  }
  const { sqlite } = getDatabaseConnection()
  const running = sqlite
    .prepare(`SELECT 1 FROM agent_runs r JOIN agent_threads t ON t.id = r.thread_id
    WHERE t.download_id = ? AND json_extract(r.data, '$.status') = 'running' LIMIT 1`)
    .get(downloadId)
  if (running) {
    return
  }
  const media = await groupVideoFiles(source, async (from, to) => {
    await queue.relocateFileReferences(from, to)
    try {
      sqlite
        .prepare('UPDATE transcripts SET source_file_path = ? WHERE source_file_path = ?')
        .run(to, from)
    } catch (error) {
      await queue.relocateFileReferences(to, from)
      throw error
    }
  })
  for (const document of documents) {
    const file = writeVideoSkillDocument(media, document)
    if (file) {
      log.info('Saved video skill Markdown', { downloadId, skill: document.skill, file })
    }
  }
}

/** Export root skill answers only; follow-up replies never replace the original document. */
export function saveVideoAgentResults(thread: AgentThread): Promise<void> {
  if (thread.promptId === 'chat') {
    return Promise.resolve()
  }
  return schedule(thread.downloadId, async () => {
    const selected = selectedAgentMessages(thread)
    const answers = selected.filter((message) => {
      const user = selected.find((entry) => entry.id === message.parentId)
      return message.role === 'assistant' && user?.role === 'user' && !user.parentId
    })
    const answer = answers.findLast((message) =>
      thread.runs.some((run) => run.id === message.runId && run.status === 'completed')
    )
    const run = thread.runs.find((entry) => entry.id === answer?.runId)
    if (!(answer?.text.trim() && run)) {
      return
    }
    const task = peekDesktopTaskQueueRef()?.get(thread.downloadId)
    await synchronizeVideo(thread.downloadId, [
      {
        skill: thread.promptId,
        text: await markdownWithEmbeddedImages(answer.text, thread.id),
        title: task?.input.title ?? thread.promptId,
        sourceUrl: task?.input.url,
        model: run.model,
        runId: run.id,
        createdAt: run.createdAt
      }
    ])
  })
}

/** Keep older prompt-run callers on the same automatic Markdown path. */
export function saveVideoPromptResult(snapshot: AiPromptRunSnapshot): Promise<void> {
  if (snapshot.status !== 'completed' || !snapshot.text.trim()) {
    return Promise.resolve()
  }
  return schedule(snapshot.downloadId, async () => {
    const task = peekDesktopTaskQueueRef()?.get(snapshot.downloadId)
    await synchronizeVideo(snapshot.downloadId, [
      {
        skill: snapshot.promptId,
        text: snapshot.text,
        title: task?.input.title ?? snapshot.promptId,
        sourceUrl: task?.input.url,
        runId: `legacy-${snapshot.updatedAt}`,
        createdAt: snapshot.updatedAt
      }
    ])
  })
}

/** Backfill saved answers without inference and group completed videos after startup/downloads. */
export async function startVideoLibraryFiles(): Promise<void> {
  const queue = peekDesktopTaskQueueRef()
  if (!queue) {
    return
  }
  const { getAgentChatStore } = await import('./agent-chat-store')
  const store = getAgentChatStore()
  const { sqlite } = getDatabaseConnection()
  const backfill = async (downloadId: string) => {
    await schedule(downloadId, () => synchronizeVideo(downloadId))
    const legacy = sqlite
      .prepare(`SELECT download_id, prompt_id, text, updated_at FROM transcript_prompt_runs
      WHERE download_id = ? AND status = 'completed' AND text != ''`)
      .all(downloadId) as {
      download_id: string
      prompt_id: string
      text: string
      updated_at: number
    }[]
    for (const row of legacy) {
      await saveVideoPromptResult({
        downloadId,
        promptId: row.prompt_id,
        text: row.text,
        status: 'completed',
        thinking: '',
        thinkingMs: 0,
        updatedAt: row.updated_at,
        error: null,
        errorCode: null
      })
    }
    for (const header of store.listVideoThreads(downloadId)) {
      const thread = store.get(header.id, { sessionEntries: false })
      if (thread) {
        await saveVideoAgentResults(thread)
      }
    }
  }
  queue.subscribe((event) => {
    if (event.type === 'transition' && event.to === 'completed') {
      const task = queue.get(event.taskId)
      const id = task?.kind === 'transcription' ? task.parentId : task?.id
      if (id) {
        void backfill(id).catch((error: unknown) =>
          log.warn('Video library backfill failed', { error })
        )
      }
    }
  })
  for (const task of queue.list({ limit: Number.MAX_SAFE_INTEGER }).tasks) {
    if (task.kind === 'video' && task.status === 'completed') {
      await backfill(task.id)
    }
  }
}
