// Public surface of @vidbee/task-queue. Adapters import from here.

export type {
  AddTaskRequest,
  ImportCompletedRequest,
  ListOptions,
  TaskQueueAPIOptions
} from './api/index.js'
export { TaskQueueAPI } from './api/index.js'
export type { ClassifyInput } from './classifier/index.js'
export {
  CLASSIFIER_RULES,
  classify,
  defaultMaxAttempts,
  getRuleForCategory,
  parseRetryAfter,
  sanitizeOutput,
  takeStderrTail,
  virtualError
} from './classifier/index.js'
export type { OutputCompleteCheck } from './complete.js'
export { isOutputComplete } from './complete.js'
export { downloadIdentity } from './download-identity.js'
export type {
  ErrorClassifiedEvent,
  OrphanKilledEvent,
  ProgressEvent,
  SnapshotChangedEvent,
  TaskQueueEvent,
  TaskQueueEventType,
  TaskQueueListener,
  TaskRemovedEvent,
  TransitionEvent
} from './events/index.js'
export type {
  Executor,
  ExecutorContext,
  ExecutorEvents,
  ExecutorFinishEvent,
  ExecutorProgressEvent,
  ExecutorRouterOptions,
  ExecutorRun,
  ExecutorSpawnEvent,
  ExecutorStdEvent
} from './executor/index.js'
export { ExecutorRouter } from './executor/index.js'
export type { TransitionContext, TransitionTrigger } from './fsm/index.js'
export {
  IllegalTransitionError,
  isLegalTransition,
  transition
} from './fsm/index.js'
export type {
  JournalAppendInput,
  PersistAdapter,
  PersistTransitionInput,
  RecordCloseInput,
  RecordSpawnInput,
  SqlitePersistOptions
} from './persist/index.js'
export {
  MemoryPersistAdapter,
  SqlitePersistAdapter
} from './persist/index.js'
export type {
  ReadPidStartTimeFn,
} from './process/index.js'
export {
  isPidAlive,
  readPidStartTime,
  setReadPidStartTimeImpl,
} from './process/index.js'
export type {
  LegacyDownloadProgress,
  LegacyDownloadStatus,
  LegacySubStatus,
  LegacyTaskProjection
} from './projection/index.js'
export {
  legacyDownloadStatusOf,
  legacySubStatusOf,
  projectTaskToLegacy
} from './projection/index.js'
export { computeBackoffMs } from './scheduler/index.js'
export * from './schemas.js'
export * from './types.js'
