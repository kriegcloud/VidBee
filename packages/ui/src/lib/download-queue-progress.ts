interface QueueRecord {
  id: string
  status: string
  entryType: 'active' | 'history'
  batchId?: string
  playlistId?: string
  progress?: { percent?: number }
}

export interface DownloadQueueProgress {
  active: number
  finished: number
  total: number
  percent: number
}

const isFinished = (status: string): boolean =>
  status === 'completed' || status === 'error' || status === 'cancelled'

/** Summarize the live queue and finished items from its active batches. */
export const getDownloadQueueProgress = (
  records: readonly QueueRecord[]
): DownloadQueueProgress | null => {
  const activeRecords = records.filter(
    (record) => record.entryType === 'active' && !isFinished(record.status)
  )
  if (activeRecords.length === 0) {
    return null
  }
  const activeGroups = new Set(
    activeRecords
      .map((record) => record.batchId ?? record.playlistId)
      .filter((group): group is string => Boolean(group))
  )
  const current = new Map<string, QueueRecord>()
  for (const record of records) {
    const group = record.batchId ?? record.playlistId
    if (
      record.entryType === 'active' ||
      (record.entryType === 'history' && group !== undefined && activeGroups.has(group))
    ) {
      current.set(record.id, record)
    }
  }
  let finished = 0
  let partial = 0
  for (const record of current.values()) {
    if (isFinished(record.status)) {
      finished += 1
    } else {
      partial += Math.min(100, Math.max(0, record.progress?.percent ?? 0)) / 100
    }
  }
  return {
    active: activeRecords.length,
    finished,
    total: current.size,
    percent: current.size > 0 ? Math.round(((finished + partial) / current.size) * 100) : 0
  }
}
