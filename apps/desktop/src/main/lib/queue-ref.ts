import type { TaskQueueAPI } from '@vidbee/task-queue'

let queue: TaskQueueAPI | null = null

export const setDesktopTaskQueueRef = (next: TaskQueueAPI): void => {
  queue = next
}

export const getDesktopTaskQueueRef = (): TaskQueueAPI => {
  if (!queue) {
    throw new Error('desktop task queue is not initialized')
  }
  return queue
}

/**
 * Return the desktop task queue if it has been initialized, otherwise null.
 */
export const peekDesktopTaskQueueRef = (): TaskQueueAPI | null => queue
