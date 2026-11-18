export type * from '@vidbee/task-queue/Events.model'
export type { TaskQueueListener } from '@vidbee/task-queue/TaskEvents.service'
export type TaskQueueEventType = import('@vidbee/task-queue/Events.model').TaskQueueEvent['type']
