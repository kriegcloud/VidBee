import type { TaskKind, TaskStatus } from '@vidbee/task-queue/Task.model'
export type * from '@vidbee/task-queue/Task.model'
export {
  EMPTY_PROGRESS,
  PRIORITY_USER,
  PRIORITY_SUBSCRIPTION,
  PRIORITY_BACKGROUND,
  TRANSCRIPTION_GROUP_KEY,
  isDownloadTaskKind,
  canAdmitTranscription,
  isMediaTaskKind,
  isLibraryTaskKind
} from '@vidbee/task-queue/types'
export const TRANSCRIBABLE_TASK_KINDS: ReadonlySet<TaskKind> = new Set(['video','audio','subscription-item'])
export const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set(['completed','failed','cancelled'])
