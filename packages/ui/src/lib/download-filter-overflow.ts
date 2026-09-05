export const DOWNLOAD_FILTER_TAB_GAP_PX = 6

/**
 * Count how many leading tabs fit in one row next to the overflow control.
 *
 * Unmeasured layouts (jsdom / first frame) report 0-width boxes; in that case
 * every tab stays visible so the bar does not collapse to a single item.
 */
export const countVisibleFilterTabs = (
  tabWidths: readonly number[],
  availableWidth: number,
  overflowWidth: number,
  gap = DOWNLOAD_FILTER_TAB_GAP_PX
): number => {
  const total = tabWidths.length
  if (total === 0) {
    return 0
  }
  if (availableWidth <= 0 || tabWidths.every((width) => width <= 0)) {
    return total
  }

  let allWidth = 0
  for (const [index, width] of tabWidths.entries()) {
    allWidth += width
    if (index > 0) {
      allWidth += gap
    }
  }
  if (allWidth <= availableWidth) {
    return total
  }

  const budget = availableWidth - overflowWidth - gap
  if (budget <= 0) {
    return 1
  }

  let used = 0
  let count = 0
  for (const width of tabWidths) {
    const next = count === 0 ? width : used + gap + width
    if (next > budget) {
      break
    }
    used = next
    count += 1
  }
  return Math.max(count, 1)
}

/**
 * Indexes to render in the collapsed row, keeping "All" first and pinning the
 * active tab into the last slot when it would otherwise sit in the overflow.
 */
export const visibleFilterIndexes = (
  total: number,
  visibleCount: number,
  activeIndex: number
): number[] => {
  if (total <= 0) {
    return []
  }
  const count = Math.min(Math.max(visibleCount, 1), total)
  const indexes: number[] = []
  for (let index = 0; index < count; index += 1) {
    indexes.push(index)
  }
  if (activeIndex < 0 || activeIndex >= total || indexes.includes(activeIndex)) {
    return indexes
  }
  if (count === 1) {
    return indexes
  }
  indexes[count - 1] = activeIndex
  return indexes
}

/**
 * Indexes hidden behind the overflow menu for a collapsed filter row.
 */
export const overflowFilterIndexes = (
  total: number,
  visibleCount: number,
  activeIndex: number
): number[] => {
  const visible = new Set(visibleFilterIndexes(total, visibleCount, activeIndex))
  const overflow: number[] = []
  for (let index = 0; index < total; index += 1) {
    if (!visible.has(index)) {
      overflow.push(index)
    }
  }
  return overflow
}
