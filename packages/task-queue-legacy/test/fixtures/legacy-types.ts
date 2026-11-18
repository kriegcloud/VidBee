// Pre-port declarations kept verbatim for compile-time compatibility checks.
// Concatenated declaration sections; their now-local type imports are omitted.

/**
 * Canonical domain model for @vidbee/task-queue.
 *
 * Authoritative source: docs/vidbee-task-queue-state-machine-design.md §3, §5, §7.
 * Adapters in apps/desktop, apps/api, apps/cli MUST consume these types directly;
 * any host-local divergence is a contract bug.
 */

export type TaskKind =
  | 'video'
  | 'audio'
  | 'subtitles'
  | 'playlist'
  | 'instagram-profile-category'
  | 'pinterest-gallery'
  | 'vsco-gallery'
  | 'facebook-gallery'
  | 'social-media'
  | 'tiktok-photo'
  | 'threads-post'
  | 'threads-profile'
  | 'snapchat-media'
  | 'subscription-item'
  | 'yt-dlp-forward'
  | 'transcription'
  | 'conversion'
  | 'model-download'

/** Media download kinds that may receive a transcription child task. */
export const TRANSCRIBABLE_TASK_KINDS: ReadonlySet<TaskKind> = new Set([
  'video',
  'audio',
  'subscription-item'
])

export const TRANSCRIPTION_GROUP_KEY = 'transcription'

/** Identify tasks handled by downloader-specific services. */
export const isDownloadTaskKind = (kind: TaskKind): boolean =>
  kind !== 'transcription' && kind !== 'conversion' && kind !== 'model-download'

/**
 * Return whether a new ASR task may start.
 * Transcription waits while active downloads fill the download cap, then starts when a slot frees.
 *
 * @param activeDownloads Download tasks currently occupying a scheduler slot.
 * @param maxConcurrentDownloads Configured download cap.
 */
export const canAdmitTranscription = (
  activeDownloads: number,
  maxConcurrentDownloads: number
): boolean => activeDownloads < maxConcurrentDownloads

/** Media-producing tasks share file, playback and history surfaces. */
export const isMediaTaskKind = (kind: TaskKind): boolean =>
  (isDownloadTaskKind(kind) && kind !== 'subtitles') || kind === 'conversion'

/** Library entries include subtitle sources that have no playable audio or video. */
export const isLibraryTaskKind = (kind: TaskKind): boolean =>
  isMediaTaskKind(kind) || kind === 'subtitles'

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'processing'
  | 'paused'
  | 'retry-scheduled'
  | 'completed'
  | 'failed'
  | 'cancelled'

export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'completed',
  'failed',
  'cancelled'
])

export type TaskPriority = 0 | 10 | 20

export const PRIORITY_USER: TaskPriority = 0
export const PRIORITY_SUBSCRIPTION: TaskPriority = 10
export const PRIORITY_BACKGROUND: TaskPriority = 20

export type ErrorCategory =
  | 'http-429'
  | 'auth-required'
  | 'geo-blocked'
  | 'not-found'
  | 'disk-full'
  | 'permission-denied'
  | 'binary-missing'
  | 'ffmpeg'
  | 'network-transient'
  | 'stalled'
  | 'cancelled-by-user'
  | 'output-missing'
  | 'unknown'

/** Creation provenance is independent of the executor and survives retries. */
export interface TaskCreationMetadata {
  origin: 'manual' | 'subscription' | 'agent'
  agentConversation?: {
    downloadId: string
    threadId: string
    promptId: string
  }
}

export interface TaskInput {
  url: string
  kind: TaskKind
  /** Title at submit time (best-effort; may be filled in later by probe). */
  title?: string
  thumbnail?: string
  /** RSS subscription id when this task is a subscription-item. */
  subscriptionId?: string
  /** Playlist parent id when applicable. */
  playlistId?: string
  playlistIndex?: number
  /**
   * Raw yt-dlp argv passed by the caller. Only used for hashing into
   * `attempts.raw_args_hash` so we can correlate retries with the snapshot
   * that produced them. Adapters are responsible for sanitization.
   */
  rawArgs?: readonly string[]
  /** Free-form host hints (output template, cookies, proxy...). */
  options?: Record<string, unknown>
}

export type TranscriptResultKind = 'transcript' | 'no-speech'

export interface TranscriptTaskResult {
  resultKind: TranscriptResultKind
  transcriptId: string
}

export type SubtitleDownloadStatus = 'downloaded' | 'unavailable' | 'skipped-auth' | 'failed'

export interface SocialCollectionSummary {
  posts: number
  images: number
  videos: number
  downloaded: number
  existing: number
  failed: number
  totalSize: number
  reason: 'exhausted' | 'limit' | 'incomplete'
  manifestPath: string
  startedAt: number
  finishedAt?: number
}

/** Cookie acquisition method, without cookie values, file paths, or browser profiles. */
export interface DownloadCookieSource {
  type: 'extension' | 'browser' | 'file' | 'config'
  browser?: string
}

export interface TaskOutput {
  collectionSummary?: SocialCollectionSummary
  /** Sources used for this download; an empty array means none, absence means unrecorded. */
  cookieSources?: DownloadCookieSource[]
  /** Immutable acquisition facts captured by the downloader process. */
  subtitleAcquisition?: {
    id: string
    acquiredAt: number
    credentialsUsed?: boolean
    visibility?: 'public' | 'private' | 'unlisted'
  }

  filePath: string
  size: number
  durationMs: number | null
  /** sha256 of file at completion, or null if not computed. */
  sha256: string | null
  /**
   * yt-dlp's resolved format id (e.g. `30080+30280`) — captured via
   * `--print after_move:%(format_id)s` so hosts can detect when the chain
   * fell back from the user's pick. null when the executor doesn't surface
   * one (e.g. fake fixtures, raw `yt-dlp -j` info-fetch).
   */
  formatId?: string | null
  /** Root directory for multi-file tasks such as an Instagram profile category. */
  outputDirectory?: string
  /** Total files materialized by the task, including existing files. */
  fileCount?: number
  /** Files downloaded during this attempt. */
  downloadedCount?: number
  /** Files already present and skipped during this attempt. */
  skippedCount?: number
  /** Files gallery-dl reported as failed during this attempt. */
  failedCount?: number
  /** Aggregate size of materialized files when cheaply available. */
  totalSize?: number
  /** Outcome of an optional subtitle request; absent when subtitles were not requested. */
  subtitleStatus?: SubtitleDownloadStatus
  /** Actual yt-dlp subtitle language tags selected for download. */
  subtitleLanguages?: string[]
  /**
   * Set after ASR or downloaded website captions have been committed to SQLite.
   * ASR may also commit an explicit no-speech result.
   */
  transcript?: TranscriptTaskResult
}

export interface TaskProgress {
  collectionSummary?: SocialCollectionSummary
  /** 0..1 inclusive. Sparse — null while parsing or before yt-dlp emits. */
  percent: number | null
  bytesDownloaded: number | null
  bytesTotal: number | null
  speedBps: number | null
  etaMs: number | null
  /** Non-monotonic rolling counter, bumped any time the executor emits. */
  ticks: number
}

export const EMPTY_PROGRESS: TaskProgress = {
  percent: null,
  bytesDownloaded: null,
  bytesTotal: null,
  speedBps: null,
  etaMs: null,
  ticks: 0
}

export interface ClassifiedError {
  category: ErrorCategory
  exitCode: number | null
  /** stderr tail (≤ 8KB). MUST be sanitized before persisting. */
  rawMessage: string
  uiMessageKey: string
  uiActionHints: readonly string[]
  retryable: boolean
  /** null → use default backoff, non-null → honor (e.g. Retry-After). */
  suggestedRetryAfterMs: number | null
}

export interface Task {
  id: string
  kind: TaskKind
  parentId: string | null
  input: TaskInput
  priority: TaskPriority
  groupKey: string
  status: TaskStatus
  /** Status the FSM held immediately before the current one (for diagnostics). */
  prevStatus: TaskStatus | null
  /** Why we are in this status: 'crash-recovery', 'paused-by-user', error category, etc. */
  statusReason: string | null
  enteredStatusAt: number
  attempt: number
  maxAttempts: number
  nextRetryAt: number | null
  progress: TaskProgress
  output: TaskOutput | null
  lastError: ClassifiedError | null
  pid: number | null
  pidStartedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface AttemptRow {
  id: string
  taskId: string
  attemptNumber: number
  startedAt: number
  endedAt: number | null
  exitCode: number | null
  errorCategory: ErrorCategory | null
  stdoutTail: string | null
  stderrTail: string | null
  rawArgsHash: string
}

export type ProcessJournalOp = 'spawn' | 'close' | 'killed' | 'panic'

export interface ProcessJournalRow {
  seq: number
  ts: number
  op: ProcessJournalOp
  taskId: string
  attemptId: string | null
  pid: number
  pidStartedAt: number | null
  exitCode: number | null
  signal: string | null
}

export type ProcessKind = 'yt-dlp' | 'gallery-dl' | 'ffmpeg' | 'ffprobe' | 'ai-worker'

/**
 * Read-only snapshot returned by TaskStore.snapshot(). Consumers MUST treat
 * this as immutable; mutating requires going through TaskFSM.transition().
 */
export interface TaskSnapshot {
  readonly task: Readonly<Task>
}

export interface TaskQueueStats {
  total: number
  byStatus: Record<TaskStatus, number>
  running: number
  queued: number
  capacity: number
  perGroup: Record<string, number>
}



export interface TransitionEvent {
  type: 'transition'
  taskId: string
  from: TaskStatus | null
  to: TaskStatus
  reason: string | null
  attempt: number
  at: number
}

export interface ProgressEvent {
  type: 'progress'
  taskId: string
  progress: Readonly<TaskProgress>
  at: number
}

export interface SnapshotChangedEvent {
  type: 'snapshot-changed'
  taskId: string
  task: Readonly<Task>
  at: number
}

/** A durable removal, including child tasks removed with their parent. */
export interface TaskRemovedEvent {
  type: 'task-removed'
  taskId: string
  at: number
}

export interface OrphanKilledEvent {
  type: 'orphan-killed'
  taskId: string
  pid: number
  pidStartedAt: number | null
  signal: 'SIGTERM' | 'SIGKILL'
  at: number
}

export interface ErrorClassifiedEvent {
  type: 'error-classified'
  taskId: string
  attempt: number
  error: ClassifiedError
  at: number
}

/** A single stdout/stderr line from the running executor, for live log streaming. */
export interface LogEvent {
  type: 'log'
  taskId: string
  attemptId: string
  stream: 'stdout' | 'stderr'
  line: string
  at: number
}

export type TaskQueueEvent =
  | TransitionEvent
  | ProgressEvent
  | SnapshotChangedEvent
  | TaskRemovedEvent
  | OrphanKilledEvent
  | ErrorClassifiedEvent
  | LogEvent

export type TaskQueueEventType = TaskQueueEvent['type']

export type TaskQueueListener<E extends TaskQueueEvent = TaskQueueEvent> = (event: E) => void


/**
 * Executor — host-neutral interface that the orchestrator uses to spawn a
 * single attempt of a task. The default production implementation lives in
 * @vidbee/downloader-core (`YtDlpExecutor`) and is owned by NEX-131. Tests
 * supply a fake.
 */

export interface ExecutorSpawnEvent {
  taskId: string
  attemptId: string
  pid: number
  pidStartedAt: number | null
  kind: ProcessKind
  spawnedAt: number
}

export interface ExecutorProgressEvent {
  taskId: string
  attemptId: string
  progress: TaskProgress
  /**
   * True when yt-dlp emits a Postprocess/Merging line — the orchestrator
   * uses this to transition `running -> processing`.
   */
  enteredProcessing: boolean
}

export interface ExecutorStdEvent {
  taskId: string
  attemptId: string
  stream: 'stdout' | 'stderr'
  /** A complete line with no trailing newline. */
  line: string
  /** A bounded, explicit server backoff; the watchdog allows this silence. */
  expectedSilenceMs?: number
}

export interface ExecutorFinishEvent {
  taskId: string
  attemptId: string
  /**
   * One of:
   *   - 'success' with output (filePath, size, ...) if the executor verified
   *      the file exists and is non-empty.
   *   - 'error' with a ClassifiedError if the run produced a non-zero exit
   *      or the executor decided to surface a structured failure.
   *   - 'cancelled' if the orchestrator requested cancel and the child has
   *      been reaped.
   */
  result:
    | { type: 'success'; output: TaskOutput }
    | { type: 'error'; error: ClassifiedError; exitCode: number | null }
    | { type: 'cancelled' }
  closedAt: number
  /** stdoutTail/stderrTail to be persisted on the attempt row. */
  stdoutTail: string
  stderrTail: string
}

export interface ExecutorEvents {
  onSpawn: (e: ExecutorSpawnEvent) => void
  onProgress: (e: ExecutorProgressEvent) => void
  /** Postprocessing can start without another download progress event. */
  onProcessing?: (e: Pick<ExecutorProgressEvent, 'taskId' | 'attemptId'>) => void
  onStd: (e: ExecutorStdEvent) => void
  onFinish: (e: ExecutorFinishEvent) => void
}

export interface ExecutorRun {
  /**
   * Issue SIGTERM and reap. The implementation MUST resolve onFinish with
   * `{ type: 'cancelled' }` after the child closes; the orchestrator will
   * issue SIGKILL after a 10s grace period (handled here so the kernel does
   * not need to know OS specifics).
   */
  cancel: (timeout?: number) => Promise<void>
  /**
   * Pause: SIGTERM but record that resume is allowed. Same finish semantics
   * as cancel; orchestrator will stamp `paused('user')` on the FSM.
   */
  pause: () => Promise<void>
}

export interface ExecutorContext {
  taskId: string
  attemptId: string
  attemptNumber: number
  input: TaskInput
}

export interface Executor {
  /**
   * Begin a new attempt. Returns a handle used to cancel/pause. The
   * orchestrator subscribes to events through the supplied `events`
   * callbacks; the executor MUST call them in order:
   *    onSpawn → (onProgress|onProcessing|onStd)* → onFinish (exactly once).
   */
  run(ctx: ExecutorContext, events: ExecutorEvents): ExecutorRun
}


/**
 * PersistAdapter — single writer to the durable store. The contract here is
 * what the orchestrator and ProcessRegistry use; concrete implementations
 * (memory for `--vidbee-local`, SQLite for production) live alongside.
 *
 * Design rules (§9):
 *   - One writer. The orchestrator is the only caller.
 *   - transition writes are immediate (BEGIN IMMEDIATE on SQLite).
 *   - progress writes are downsampled to ≤ 1Hz; terminal transitions force a
 *     flush of the most recent progress.
 *   - pid + pidStartedAt are written synchronously inside `recordSpawn`; no
 *     throttling allowed.
 */

export interface PersistTransitionInput {
  task: Task
  /** snapshot to atomically write progress alongside the transition. */
  progress: TaskProgress
}

export interface RecordSpawnInput {
  taskId: string
  attemptId: string
  pid: number
  pidStartedAt: number | null
  startedAt: number
  rawArgsHash: string
}

export interface RecordCloseInput {
  taskId: string
  attemptId: string
  endedAt: number
  exitCode: number | null
  errorCategory: AttemptRow['errorCategory']
  stdoutTail: string | null
  stderrTail: string | null
}

export interface JournalAppendInput {
  ts: number
  op: ProcessJournalOp
  taskId: string
  attemptId: string | null
  pid: number
  pidStartedAt: number | null
  exitCode: number | null
  signal: string | null
}

export interface PersistAdapter {
  /**
   * Whether `taskId` has a row in the durable store. Callers that share the
   * database across hosts must use this instead of an in-memory snapshot:
   * another process can insert or delete the row after this process started.
   */
  hasTask(taskId: string): Promise<boolean>
  /** Insert a new task (called from `add()`). */
  insertTask(task: Task): Promise<void>
  /** Replace the existing task row + progress row. Used for every transition. */
  upsertTask(input: PersistTransitionInput): Promise<void>
  /** Atomically replace related task snapshots when a shared source file moves. */
  upsertTasks(inputs: PersistTransitionInput[]): Promise<void>
  /** Downsampled progress write (the orchestrator calls at most every 1s). */
  upsertProgress(taskId: string, progress: TaskProgress): Promise<void>
  /**
   * Remove a task and its descendants (transcription children, playlist
   * entries). Required because `tasks.parent_id` references `tasks(id)`
   * without ON DELETE CASCADE.
   */
  deleteTask(taskId: string): Promise<void>
  /** Insert a new attempt row at spawn time. */
  insertAttempt(input: RecordSpawnInput): Promise<void>
  /** Update the attempt row at close time. */
  closeAttempt(input: RecordCloseInput): Promise<void>
  /** Append a process_journal row. */
  appendJournal(input: JournalAppendInput): Promise<void>
  /** Find spawn rows that have no matching close/killed entry. */
  findOpenSpawns(): Promise<ProcessJournalRow[]>
  /** Restore all task rows on startup (crash recovery). */
  loadAllTasks(): Promise<Task[]>
  /** Restore the latest attempt row per task on startup. */
  loadLatestAttempt(taskId: string): Promise<AttemptRow | null>
  /**
   * Periodic maintenance: WAL checkpoint + journal aging. Optional —
   * memory impl is a no-op.
   */
  maintenance?(): Promise<void>
  /** Close the underlying connection. */
  close?(): Promise<void> | void
}
