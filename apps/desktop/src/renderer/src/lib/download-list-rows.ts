import { resolveDownloadPlatform } from '@vidbee/ui/lib/download-platform'
import {
  resolveCreatorProfileGroup,
  type SavedSocialProfileGroup
} from '@vidbee/ui/lib/saved-social-profile-groups'
import type { DownloadRecord } from '../store/downloads'
import { buildDownloadTaskTree } from './download-task-tree'

export interface DownloadListTaskRow {
  kind: 'task'
  key: string
  depth: number
  record: DownloadRecord
}

export interface DownloadListPlaylistRow {
  kind: 'playlist'
  isPlaylist: boolean
  key: string
  groupId: string
  title: string
  /** Site the group belongs to, shown beside the title. */
  platformLabel: string | null
  platformDomain: string | null
  totalCount: number
  records: DownloadRecord[]
}

export type DownloadListRow = DownloadListTaskRow | DownloadListPlaylistRow

/** Filtered task position before playlist expansion hides any rows. */
export interface DownloadListLocation {
  groupId: string | null
  expandedRowIndex: number
}

export interface DownloadListModel {
  rows: DownloadListRow[]
  locations: Map<string, DownloadListLocation>
  rowIndexById: Map<string, number>
  matchingIds: Set<string>
  contextIds: Set<string>
}

interface PlaylistGroup {
  isPlaylist: boolean
  id: string
  title: string
  platformLabel: string | null
  platformDomain: string | null
  totalCount: number
  records: DownloadRecord[]
}

/**
 * Append one task and its nested descendants.
 * Locations are recorded only while building the fully expanded list.
 */
const appendTasks = (
  record: DownloadRecord,
  depth: number,
  children: Map<string, DownloadRecord[]>,
  rows: DownloadListRow[],
  locations: Map<string, DownloadListLocation> | null,
  groupId: string | null
): void => {
  if (locations && !locations.has(record.id)) {
    locations.set(record.id, { expandedRowIndex: rows.length, groupId })
  }
  rows.push({
    depth,
    // Keyed by task, not entry type: retrying moves a row from history to active,
    // and a key change there would drop its measured height and jump the list.
    key: `task:${record.id}`,
    kind: 'task',
    record
  })
  const nested = children.get(record.id) ?? []
  for (const child of nested) {
    appendTasks(child, depth + 1, children, rows, locations, groupId)
  }
}

/**
 * Group playlist roots the same way the history list did before virtualization.
 */
const groupRoots = (
  roots: DownloadRecord[],
  savedProfileGroups?: ReadonlyMap<string, SavedSocialProfileGroup>
): {
  groups: Map<string, PlaylistGroup>
  order: Array<{ type: 'group'; id: string } | { type: 'single'; record: DownloadRecord }>
} => {
  const groups = new Map<string, PlaylistGroup>()
  const order: Array<{ type: 'group'; id: string } | { type: 'single'; record: DownloadRecord }> =
    []
  for (const record of roots) {
    const savedGroup = savedProfileGroups?.get(record.url) ?? resolveCreatorProfileGroup(record)
    const groupId = savedGroup?.id ?? record.batchId ?? record.playlistId
    if (groupId) {
      let group = groups.get(groupId)
      if (!group) {
        const platform = resolveDownloadPlatform(record.url)
        group = {
          id: groupId,
          isPlaylist: !(savedGroup || record.batchId),
          platformDomain: platform.domain,
          platformLabel: platform.domain ? platform.label : null,
          records: [],
          title: savedGroup?.title || record.batchTitle || record.playlistTitle || record.title,
          totalCount: savedGroup || record.batchId ? 0 : record.playlistSize || 0
        }
        groups.set(groupId, group)
        order.push({ id: groupId, type: 'group' })
      }
      group.records.push(record)
      if (!group.title && (record.batchTitle || record.playlistTitle)) {
        group.title = record.batchTitle || record.playlistTitle || record.title
      }
      if (!group.totalCount && record.playlistSize) {
        group.totalCount = record.playlistSize
      }
    } else {
      order.push({ record, type: 'single' })
    }
  }
  for (const group of groups.values()) {
    group.records.sort((left, right) => {
      const leftIndex = left.batchOrder ?? left.playlistIndex ?? Number.MAX_SAFE_INTEGER
      const rightIndex = right.batchOrder ?? right.playlistIndex ?? Number.MAX_SAFE_INTEGER
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex
      }
      return right.createdAt - left.createdAt
    })
    if (!group.totalCount) {
      group.totalCount = group.records.length
    }
  }
  return { groups, order }
}

/**
 * Build visible rows plus a pre-expand id index.
 * Collapsed playlist members stay in `locations` so transfer can expand that one group.
 */
export const buildDownloadListModel = (input: {
  records: DownloadRecord[]
  savedProfileGroups?: ReadonlyMap<string, SavedSocialProfileGroup>
  filtered: DownloadRecord[]
  contexts: DownloadRecord[]
  isExpanded: (groupId: string) => boolean
}): DownloadListModel => {
  const tree = buildDownloadTaskTree(input.records, input.filtered, input.contexts)
  const { groups, order } = groupRoots(tree.roots, input.savedProfileGroups)
  const locations = new Map<string, DownloadListLocation>()
  const expandedRows: DownloadListRow[] = []
  const rows: DownloadListRow[] = []

  /**
   * Walk groups once for the full index and once for the rows currently expanded.
   */
  const walk = (collectLocations: boolean, into: DownloadListRow[]): void => {
    for (const item of order) {
      if (item.type === 'single') {
        appendTasks(item.record, 0, tree.children, into, collectLocations ? locations : null, null)
        continue
      }
      const group = groups.get(item.id)
      if (!group) {
        continue
      }
      into.push({
        groupId: group.id,
        key: `group:${group.id}`,
        kind: 'playlist',
        isPlaylist: group.isPlaylist,
        platformDomain: group.platformDomain,
        platformLabel: group.platformLabel,
        records: group.records,
        title: group.title,
        totalCount: group.totalCount
      })
      if (!(collectLocations || input.isExpanded(group.id))) {
        continue
      }
      for (const record of group.records) {
        appendTasks(record, 0, tree.children, into, collectLocations ? locations : null, group.id)
      }
    }
  }

  walk(true, expandedRows)
  walk(false, rows)
  const rowIndexById = new Map<string, number>()
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (row?.kind === 'task' && !rowIndexById.has(row.record.id)) {
      rowIndexById.set(row.record.id, index)
    }
  }
  return {
    contextIds: tree.contextIds,
    locations,
    matchingIds: tree.matchingIds,
    rowIndexById,
    rows
  }
}
