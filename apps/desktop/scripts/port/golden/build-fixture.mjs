import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const FIXTURE_IDS = Object.freeze({
  completed: 'golden-completed',
  audio: 'golden-audio',
  paused: 'golden-paused',
  failed: 'golden-failed',
  cancelled: 'golden-cancelled',
  queued: 'golden-queued',
  running: 'golden-running',
  processing: 'golden-processing',
  retry: 'golden-retry',
  transcript: 'golden-transcript',
  segment: 'golden-segment-1',
  speaker: 'golden-speaker-1',
  subscription: 'golden-subscription',
  item: 'golden-item-1',
  thread: 'golden-thread',
  message: 'golden-message-user',
  prompt: 'golden-summary'
})
const NOW = 1_735_689_600_000
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))

// Read the exact app DDL rather than maintaining an independent schema mirror.
async function ddl(file, constant) {
  const source = await readFile(path.join(ROOT, file), 'utf8')
  const value = source.match(new RegExp(`export const ${constant} = \`([\\s\\S]*?)\``))?.[1]
  if (!value || value.includes('${')) {
    throw new Error(`Cannot extract literal DDL: ${constant}`)
  }
  return value
}

function insert(db, table, row) {
  const columns = Object.keys(row)
  db.prepare(
    `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`
  ).run(...Object.values(row))
}

function silenceWav() {
  const samples = 60_000
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(16_000, 24)
  wav.writeUInt32LE(32_000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  return wav
}

/** Populate a stopped, freshly bootstrapped disposable user-data directory. */
export async function buildFixture(profileDir, { pathRoot = profileDir } = {}) {
  if (!path.isAbsolute(profileDir)) {
    throw new Error('Fixture profile must be an absolute path')
  }
  if (!path.isAbsolute(pathRoot)) {
    throw new Error('Fixture path root must be an absolute path')
  }
  const databasePath = path.join(profileDir, 'vidbee.db')
  if (!existsSync(databasePath)) {
    throw new Error('Bootstrap the app schema before building the fixture')
  }
  const mediaDir = path.join(pathRoot, 'golden-media')
  const physicalMediaDir = path.join(profileDir, 'golden-media')
  await mkdir(physicalMediaDir, { recursive: true })
  const physicalPath = (reference) => path.join(physicalMediaDir, path.basename(reference))
  const mediaPath = path.join(mediaDir, 'Golden field recording.wav')
  const importPath = path.join(mediaDir, 'import-sample.wav')
  const thumbnailPath = path.join(mediaDir, 'thumbnail.png')
  const subtitlePath = path.join(mediaDir, 'Golden field recording.en.srt')
  const wav = silenceWav()
  await writeFile(physicalPath(mediaPath), wav)
  await writeFile(physicalPath(importPath), wav)
  await writeFile(
    physicalPath(thumbnailPath),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64'
    )
  )
  await writeFile(
    physicalPath(subtitlePath),
    '1\n00:00:00,000 --> 00:00:01,250\nWelcome to the synthetic field notes.\n\n2\n00:00:01,250 --> 00:00:03,500\nThe river sounds clear this morning.\n'
  )
  const configPath = path.join(profileDir, 'config.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  Object.assign(config, {
    language: 'en',
    theme: 'light',
    downloadPath: mediaDir,
    autoTranscribeAfterDownload: false,
    launchAtLogin: false
  })
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
  const skillDir = path.join(profileDir, 'skills', FIXTURE_IDS.prompt)
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: golden-summary\ndescription: Summarize synthetic field notes.\n---\n\nSummarize the provided transcript in one clear paragraph.\n'
  )
  const db = new DatabaseSync(databasePath)
  try {
    db.exec('PRAGMA foreign_keys=ON')
    // Tasks and subscriptions must have been created by the app bootstrap.
    for (const table of ['tasks', 'subscriptions', 'subscription_items']) {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
        throw new Error(`App bootstrap did not create ${table}`)
      }
    }
    const columns = (table) =>
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name)
    for (const [file, constants] of [
      ['packages/db/src/transcripts.ts', ['TRANSCRIPT_DDL_V1']],
      ['packages/db/src/prompt-runs.ts', ['PROMPT_RUN_DDL_V1']]
    ]) {
      for (const constant of constants) {
        db.exec(await ddl(file, constant))
      }
    }
    for (const [table, column, file, constant] of [
      ['transcripts', 'asr_tier', 'transcripts', 'TRANSCRIPT_DDL_V2'],
      ['transcript_segments', 'words_json', 'transcripts', 'TRANSCRIPT_DDL_V3'],
      ['transcripts', 'source_kind', 'transcripts', 'TRANSCRIPT_DDL_V4'],
      ['transcript_prompt_runs', 'thinking', 'prompt-runs', 'PROMPT_RUN_DDL_V2'],
      ['transcript_prompt_runs', 'thinking_ms', 'prompt-runs', 'PROMPT_RUN_DDL_V3'],
      ['transcript_prompt_runs', 'cloud_result_id', 'prompt-runs', 'PROMPT_RUN_DDL_V4']
    ]) {
      if (!columns(table).includes(column)) {
        db.exec(await ddl(`packages/db/src/${file}.ts`, constant))
      }
    }
    const chatSource = await readFile(
      path.join(ROOT, 'apps/desktop/src/main/lib/agent-chat-store.ts'),
      'utf8'
    )
    const chatDdl = chatSource.match(
      /db\.exec\(`(CREATE TABLE IF NOT EXISTS agent_threads[\s\S]*?)`\)/
    )?.[1]
    if (!chatDdl) {
      throw new Error('Cannot extract app agent chat DDL')
    }
    db.exec(chatDdl)
    db.exec('BEGIN IMMEDIATE')
    const statuses = [
      'completed',
      'paused',
      'failed',
      'cancelled',
      'queued',
      'running',
      'processing',
      'retry-scheduled'
    ]
    for (const [index, status] of statuses.entries()) {
      const id = status === 'retry-scheduled' ? FIXTURE_IDS.retry : FIXTURE_IDS[status]
      const input = {
        url: `https://example.invalid/media/${id}`,
        kind: 'video',
        title: `Golden ${status} field notes`,
        thumbnail: pathToFileURL(thumbnailPath).href,
        options: {
          type: 'video',
          title: `Golden ${status} field notes`,
          description: 'An invented recording for deterministic offline tests.',
          channel: 'Synthetic Observatory',
          uploader: 'Fixture narrator',
          viewCount: 1234,
          tags: ['field-notes', 'synthetic'],
          duration: 3.75,
          customDownloadPath: mediaDir,
          fileSize: wav.length,
          completedAt: NOW,
          startedAt: NOW - 5000
        }
      }
      const output =
        status === 'completed'
          ? {
              filePath: mediaPath,
              size: wav.length,
              durationMs: 3750,
              sha256: null,
              formatId: 'synthetic-wav',
              subtitleStatus: 'downloaded',
              subtitleLanguages: ['en']
            }
          : null
      insert(db, 'tasks', {
        id,
        kind: 'video',
        parent_id: null,
        status,
        prev_status: null,
        status_reason: status === 'paused' ? 'paused-by-user' : null,
        entered_status_at: NOW + index,
        priority: 10,
        group_key: 'example.invalid',
        attempt: status === 'failed' ? 1 : 0,
        max_attempts: 0,
        next_retry_at: status === 'retry-scheduled' ? 4_102_444_800_000 : null,
        pid: null,
        pid_started_at: null,
        created_at: NOW + index,
        updated_at: NOW + index,
        input_json: JSON.stringify(input),
        progress_json: JSON.stringify({
          percent: status === 'completed' ? 1 : 0.25,
          bytesDownloaded: 800,
          bytesTotal: wav.length,
          speedBps: null,
          etaMs: null,
          ticks: 4
        }),
        output_json: output && JSON.stringify(output),
        last_error_json:
          status === 'failed'
            ? JSON.stringify({
                category: 'not-found',
                exitCode: 1,
                rawMessage: 'Synthetic media is unavailable.',
                uiMessageKey: 'download.error.notFound',
                uiActionHints: [],
                retryable: false,
                suggestedRetryAfterMs: null
              })
            : null
      })
    }
    const completed = db.prepare('SELECT * FROM tasks WHERE id=?').get(FIXTURE_IDS.completed)
    insert(db, 'tasks', {
      ...completed,
      id: FIXTURE_IDS.audio,
      kind: 'audio',
      created_at: NOW - 1000,
      updated_at: NOW - 1000,
      input_json: JSON.stringify({
        ...JSON.parse(completed.input_json),
        kind: 'audio',
        title: 'Golden audio archive',
        url: 'https://example.invalid/media/audio',
        options: {
          ...JSON.parse(completed.input_json).options,
          type: 'audio',
          title: 'Golden audio archive'
        }
      })
    })
    insert(db, 'subscriptions', {
      id: FIXTURE_IDS.subscription,
      title: 'Golden Observatory',
      source_url: 'https://www.youtube.com/channel/UC0000000000000000000000',
      feed_url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC0000000000000000000000',
      platform: 'youtube',
      keywords: JSON.stringify(['river', 'morning']),
      tags: JSON.stringify(['science', 'fixture']),
      only_latest: 0,
      auto_download: 0,
      enabled: 0,
      cover_url: pathToFileURL(thumbnailPath).href,
      latest_video_title: 'River morning',
      latest_video_published_at: NOW - 10_000,
      last_checked_at: NOW,
      last_success_at: NOW,
      status: 'idle',
      last_error: null,
      created_at: NOW - 100_000,
      updated_at: NOW,
      download_directory: mediaDir,
      naming_template: '%(title)s.%(ext)s'
    })
    const itemColumns = columns('subscription_items')
    for (let index = 1; index <= 3; index++) {
      insert(db, 'subscription_items', {
        subscription_id: FIXTURE_IDS.subscription,
        item_id: `golden-item-${index}`,
        title: ['River morning', 'Mountain afternoon', 'Forest evening'][index - 1],
        url: `https://www.youtube.com/watch?v=golden0000${index}`,
        published_at: NOW - index * 10_000,
        thumbnail: pathToFileURL(thumbnailPath).href,
        added: index === 1 ? 1 : 0,
        ...(itemColumns.includes('download_id')
          ? { download_id: index === 1 ? FIXTURE_IDS.completed : null }
          : {}),
        ...(itemColumns.includes('task_id')
          ? { task_id: index === 1 ? FIXTURE_IDS.completed : null }
          : {}),
        created_at: NOW - index * 1000,
        updated_at: NOW
      })
    }
    insert(db, 'transcripts', {
      id: FIXTURE_IDS.transcript,
      download_task_id: FIXTURE_IDS.completed,
      transcription_task_id: 'golden-transcription-task',
      result_kind: 'transcript',
      model_version: 'golden-asr-v1',
      asr_tier: 'minimal',
      language: 'en',
      source_file_path: mediaPath,
      source_kind: 'asr',
      superseded_at: null,
      created_at: NOW,
      updated_at: NOW
    })
    for (let index = 1; index <= 2; index++) {
      insert(db, 'transcript_speakers', {
        id: `golden-speaker-${index}`,
        transcript_id: FIXTURE_IDS.transcript,
        speaker_key: `SPEAKER_0${index - 1}`,
        display_name: index === 1 ? 'Narrator' : 'Researcher',
        sort_index: index - 1
      })
    }
    const texts = [
      'Welcome to the synthetic field notes.',
      'The river sounds clear this morning.',
      'We will return at sunset.'
    ]
    for (const [index, text] of texts.entries()) {
      insert(db, 'transcript_segments', {
        id: `golden-segment-${index + 1}`,
        transcript_id: FIXTURE_IDS.transcript,
        speaker_id: `golden-speaker-${index === 1 ? 2 : 1}`,
        start_ms: index * 1250,
        end_ms: (index + 1) * 1250,
        text,
        confidence: 0.98 - index * 0.01,
        words_json: JSON.stringify(
          text.split(' ').map((word, wordIndex, words) => ({
            text: word,
            startMs: index * 1250 + Math.floor((wordIndex * 1250) / words.length),
            endMs: index * 1250 + Math.floor(((wordIndex + 1) * 1250) / words.length)
          }))
        ),
        sort_index: index
      })
    }
    insert(db, 'transcript_prompt_runs', {
      download_id: FIXTURE_IDS.completed,
      prompt_id: FIXTURE_IDS.prompt,
      status: 'completed',
      text: 'The team recorded a river and planned a sunset visit.',
      thinking: 'Compare the three observations.',
      thinking_ms: 120,
      cloud_result_id: null,
      error: null,
      error_code: null,
      created_at: NOW,
      updated_at: NOW
    })
    const thread = {
      id: FIXTURE_IDS.thread,
      downloadId: FIXTURE_IDS.completed,
      promptId: FIXTURE_IDS.prompt,
      leafId: 'golden-message-assistant',
      seq: 1,
      title: 'Field notes summary',
      thinkingLevel: 'medium',
      messages: [],
      runs: [],
      artifacts: [],
      images: [],
      toolGrants: [],
      directory: {
        hasHistory: true,
        running: false,
        approvalPending: false,
        updatedAt: NOW,
        userText: 'Summarize these field notes.',
        status: 'completed',
        model: 'golden-offline-model'
      }
    }
    insert(db, 'agent_threads', {
      id: thread.id,
      download_id: thread.downloadId,
      prompt_id: thread.promptId,
      data: JSON.stringify(thread)
    })
    for (const [id, parentId, role, text] of [
      [FIXTURE_IDS.message, null, 'user', 'Summarize these field notes.'],
      [
        'golden-message-assistant',
        FIXTURE_IDS.message,
        'assistant',
        'The recording describes a clear river and a planned sunset visit.'
      ]
    ]) {
      insert(db, 'agent_messages', {
        id,
        thread_id: thread.id,
        data: JSON.stringify({
          id,
          parentId,
          runId: role === 'assistant' ? 'golden-agent-run' : null,
          role,
          text,
          thinking:
            role === 'assistant'
              ? 'The river observation and sunset plan are the two main details.'
              : '',
          createdAt: NOW
        })
      })
    }
    insert(db, 'agent_runs', {
      id: 'golden-agent-run',
      thread_id: thread.id,
      data: JSON.stringify({
        id: 'golden-agent-run',
        messageId: 'golden-message-assistant',
        status: 'completed',
        error: null,
        model: 'golden-offline-model',
        instruction: 'Summarize field notes.',
        createdAt: NOW,
        updatedAt: NOW,
        rawMessages: [],
        tools: [],
        usage: { input: 40, output: 20, totalTokens: 60 }
      })
    })
    insert(db, 'agent_schema', { key: 'version', value: 2 })
    db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    db.close()
  }
  return { profileDir, mediaPath, importPath, thumbnailPath, subtitlePath, ids: FIXTURE_IDS }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    throw new Error('Usage: node build-fixture.mjs <absolute-bootstrapped-profile-dir>')
  }
  console.log(JSON.stringify(await buildFixture(path.resolve(process.argv[2])), null, 2))
}
