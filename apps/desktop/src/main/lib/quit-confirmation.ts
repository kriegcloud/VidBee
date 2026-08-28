import type { TaskStatus } from '@vidbee/task-queue'

/** Statuses that represent work currently executing and would be interrupted by quit. */
export const IN_PROGRESS_TASK_STATUSES: readonly TaskStatus[] = ['running', 'processing']

export interface QuitConfirmStrings {
  title: string
  message: string
  messagePlural: string
  quit: string
  cancel: string
}

export interface QuitConfirmCopy {
  title: string
  message: string
  quit: string
  cancel: string
}

export interface QuitConfirmationDeps {
  getInProgressCount: () => number
  confirmQuit: (count: number) => Promise<boolean>
  quit: () => void
  shouldSkip?: () => boolean
}

export interface QuitConfirmationController {
  allow: () => void
  handleQuitAttempt: () => 'proceed' | 'defer'
}

/**
 * Count tasks that are actively running or processing.
 */
export const countInProgressTasks = (byStatus: Partial<Record<TaskStatus, number>>): number =>
  IN_PROGRESS_TASK_STATUSES.reduce((total, status) => total + (byStatus[status] ?? 0), 0)

/**
 * Build native-dialog copy for a quit confirmation, interpolating `{{count}}`.
 */
export const buildQuitConfirmCopy = (
  strings: QuitConfirmStrings,
  count: number
): QuitConfirmCopy => {
  const template = count === 1 ? strings.message : strings.messagePlural
  return {
    title: strings.title,
    message: template.replaceAll('{{count}}', String(count)),
    quit: strings.quit,
    cancel: strings.cancel
  }
}

/**
 * Gate app quit behind a confirmation when in-progress tasks exist.
 */
export const createQuitConfirmationController = (
  deps: QuitConfirmationDeps
): QuitConfirmationController => {
  let allowed = false
  let dialogOpen = false

  /**
   * Allow the next quit attempt to proceed without a prompt.
   */
  const allow = (): void => {
    allowed = true
  }

  /**
   * Decide whether this quit attempt may continue immediately.
   * Returns `'defer'` when the caller must preventDefault and wait for a prompt.
   */
  const handleQuitAttempt = (): 'proceed' | 'defer' => {
    if (allowed || deps.shouldSkip?.()) {
      allowed = true
      return 'proceed'
    }

    const count = deps.getInProgressCount()
    if (count <= 0) {
      allowed = true
      return 'proceed'
    }

    if (!dialogOpen) {
      dialogOpen = true
      void (async () => {
        try {
          const confirmed = await deps.confirmQuit(count)
          if (confirmed) {
            allowed = true
            deps.quit()
          }
        } finally {
          dialogOpen = false
        }
      })()
    }

    return 'defer'
  }

  return { allow, handleQuitAttempt }
}
