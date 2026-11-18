import { z } from "zod"

import { TaskKind, TaskStatus } from "@vidbee/task-queue/Task.model"

export const TaskKindSchema = z.enum(TaskKind.literals)

export const TaskStatusSchema = z.enum(TaskStatus.literals)

export const DownloadCookieSourceSchema = z.object({
  type: z.enum(['extension', 'browser', 'file', 'config']),
  browser: z.string().optional()
})

export const ListInputSchema = z.object({
  query: z.string().max(200).optional(),
  kind: TaskKindSchema.optional(),
  status: TaskStatusSchema.optional(),
  groupKey: z.string().optional(),
  parentId: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
  cursor: z.string().optional()
})
