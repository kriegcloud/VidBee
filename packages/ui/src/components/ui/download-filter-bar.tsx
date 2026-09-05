'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import {
  type MouseEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { useProximityHover } from '../../hooks/use-proximity-hover'
import { cn } from '../../lib/cn'
import {
  countVisibleFilterTabs,
  DOWNLOAD_FILTER_TAB_GAP_PX,
  overflowFilterIndexes,
  visibleFilterIndexes
} from '../../lib/download-filter-overflow'
import { ALL_DOWNLOAD_PLATFORM_FILTER } from '../../lib/download-platform'
import { spring } from '../../lib/springs'
import { Button } from './button'
import { DownloadPlatformIcon } from './download-platform-icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './dropdown-menu'

export interface DownloadFilterItem<TFilter extends string> {
  key: TFilter
  label: string
  count: number
  icon?: ReactNode
  domain?: string | null
}

interface DownloadFilterBarProps<TFilter extends string> {
  filters: DownloadFilterItem<TFilter>[]
  activeFilter: TFilter
  onFilterChange: (filter: TFilter) => void
  actions?: ReactNode
  overflowLabel: string
}

interface FilterTabProps<TFilter extends string> {
  filter: DownloadFilterItem<TFilter>
  isActive: boolean
  isHovered?: boolean
  onSelect: (filter: TFilter) => void
  measure?: boolean
  index?: number
  registerItem?: (index: number, element: HTMLElement | null) => void
  reduceMotion?: boolean
}

const FILTER_TAB_CLASS =
  'relative z-10 h-7 shrink-0 gap-1 rounded-full px-2.5 font-medium text-xs transition-[transform,color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] hover:bg-transparent [&_svg]:size-3.5'

/**
 * Leading icon for a filter chip: explicit node, otherwise the platform favicon.
 */
const FilterTabIcon = <TFilter extends string>({
  filter
}: {
  filter: DownloadFilterItem<TFilter>
}) => {
  if (filter.icon) {
    return filter.icon
  }
  if (filter.domain) {
    return <DownloadPlatformIcon className="size-3.5 rounded-[3px]" domain={filter.domain} />
  }
  return null
}

/**
 * Single platform / all filter pill. Selected fill and hover live on the
 * traveling overlay; the button only owns press scale, border, and type color.
 */
const FilterTab = <TFilter extends string>({
  filter,
  isActive,
  isHovered = false,
  onSelect,
  measure = false,
  index = 0,
  registerItem,
  reduceMotion = false
}: FilterTabProps<TFilter>) => {
  const tabRef = useRef<HTMLButtonElement>(null)
  const showCount = filter.key !== ALL_DOWNLOAD_PLATFORM_FILTER
  const accessibleName = showCount ? `${filter.label} ${filter.count}` : filter.label
  const isEmphasized = isActive || isHovered

  useEffect(() => {
    if (measure || !registerItem) {
      return
    }
    registerItem(index, tabRef.current)
    return () => registerItem(index, null)
  }, [index, measure, registerItem])

  return (
    <Button
      aria-hidden={measure || undefined}
      aria-label={measure ? undefined : accessibleName}
      aria-pressed={measure ? undefined : isActive}
      className={cn(
        FILTER_TAB_CLASS,
        isActive
          ? 'border border-transparent text-foreground'
          : 'border border-black/[0.08] text-foreground/80 dark:border-white/12',
        isEmphasized && 'text-foreground',
        reduceMotion && !isActive && 'hover:bg-muted/50 hover:text-foreground'
      )}
      disabled={measure}
      onClick={() => onSelect(filter.key)}
      ref={tabRef}
      size="sm"
      tabIndex={measure ? -1 : undefined}
      type="button"
      variant="ghost"
    >
      <FilterTabIcon filter={filter} />
      <span>{filter.label}</span>
      {showCount ? (
        <span className="font-normal text-muted-foreground tabular-nums">{filter.count}</span>
      ) : null}
    </Button>
  )
}

/**
 * Overflow chevron that opens a menu of platforms that do not fit the row.
 */
const OverflowTrigger = ({
  label,
  measure = false,
  ref
}: {
  label: string
  measure?: boolean
  ref?: Ref<HTMLButtonElement>
}) => {
  return (
    <Button
      aria-hidden={measure || undefined}
      aria-label={label}
      className={cn(
        'h-7 w-7 shrink-0 rounded-full p-0 transition-[transform,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] [&_svg]:size-3.5',
        'border border-black/[0.08] bg-transparent hover:bg-muted/50 dark:border-white/12'
      )}
      data-testid={measure ? undefined : 'download-filter-overflow'}
      disabled={measure}
      ref={ref}
      size="sm"
      tabIndex={measure ? -1 : undefined}
      type="button"
      variant="ghost"
    >
      <ChevronDown className="size-3.5" />
    </Button>
  )
}

/**
 * Home filter row: platform tabs on the left, paste/actions on the right.
 * Extra tabs collapse into a chevron dropdown. Selected fill travels between
 * chips the same way the segmented Tabs indicator does.
 */
export const DownloadFilterBar = <TFilter extends string>({
  filters,
  activeFilter,
  onFilterChange,
  actions,
  overflowLabel
}: DownloadFilterBarProps<TFilter>) => {
  const clusterRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const isMouseInside = useRef(false)
  const reduceMotion = useReducedMotion() ?? false
  const [visibleCount, setVisibleCount] = useState(filters.length)
  const [optimisticIdx, setOptimisticIdx] = useState<number | null>(null)

  const {
    activeIndex: hoveredIndex,
    itemRects,
    isMeasured,
    handlers,
    registerItem
  } = useProximityHover(tabsRef, { axis: 'x' })

  useLayoutEffect(() => {
    const cluster = clusterRef.current
    const measure = measureRef.current
    if (!(cluster && measure)) {
      return
    }

    const update = () => {
      const children = Array.from(measure.children) as HTMLElement[]
      if (children.length < 2) {
        setVisibleCount(filters.length)
        return
      }
      const overflowWidth = children.at(-1)?.getBoundingClientRect().width ?? 0
      const tabWidths = children.slice(0, -1).map((child) => child.getBoundingClientRect().width)
      const nextVisible = countVisibleFilterTabs(
        tabWidths,
        cluster.getBoundingClientRect().width,
        overflowWidth,
        DOWNLOAD_FILTER_TAB_GAP_PX
      )
      setVisibleCount(nextVisible)
    }

    update()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(update)
    observer.observe(cluster)
    observer.observe(measure)
    return () => observer.disconnect()
  }, [filters])

  const hasOverflow = visibleCount < filters.length
  const activeIndex = filters.findIndex((filter) => filter.key === activeFilter)
  const renderedIndexes = hasOverflow
    ? visibleFilterIndexes(filters.length, visibleCount, activeIndex)
    : filters.map((_, index) => index)
  const hiddenIndexes = hasOverflow
    ? overflowFilterIndexes(filters.length, visibleCount, activeIndex)
    : []
  const selectedVisualIndex = renderedIndexes.findIndex(
    (filterIndex) => filters[filterIndex]?.key === activeFilter
  )

  useEffect(() => {
    setOptimisticIdx(selectedVisualIndex >= 0 ? selectedVisualIndex : null)
  }, [selectedVisualIndex])

  const activeSelectedIdx = optimisticIdx
  const selectedRect = activeSelectedIdx === null ? null : (itemRects[activeSelectedIdx] ?? null)
  const hoverRect = hoveredIndex === null ? null : (itemRects[hoveredIndex] ?? null)
  const isHoveringSelected = hoveredIndex === activeSelectedIdx
  const isHovering = hoveredIndex !== null && !isHoveringSelected
  const selectedTransition = reduceMotion
    ? { duration: 0 }
    : { ...spring.moderate, opacity: { duration: 0.08 } }
  const hoverTransition = reduceMotion
    ? { duration: 0 }
    : { ...spring.fast, opacity: { duration: 0.08 } }

  /**
   * Track pointer presence so the hover fill can retreat into the selected chip.
   */
  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    isMouseInside.current = true
    handlers.onMouseMove(event)
  }

  /**
   * Clear hover when the pointer leaves the visible chip row.
   */
  const handleMouseLeave = () => {
    isMouseInside.current = false
    handlers.onMouseLeave()
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="relative min-w-0 flex-1" ref={clusterRef}>
        <div
          aria-hidden
          className="pointer-events-none invisible absolute inset-y-0 left-0 flex items-center gap-1.5"
          ref={measureRef}
        >
          {filters.map((filter) => (
            <FilterTab
              filter={filter}
              isActive={false}
              key={`measure:${filter.key}`}
              measure
              onSelect={onFilterChange}
            />
          ))}
          <OverflowTrigger label={overflowLabel} measure />
        </div>
        <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
          {/* Proximity hover tracks the row; the chips remain the only interactive targets. */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer tracking layer over tab buttons */}
          <div
            className="relative flex flex-nowrap items-center gap-1.5"
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
            ref={tabsRef}
          >
            {isMeasured && selectedRect ? (
              <motion.div
                animate={{
                  height: selectedRect.height,
                  left: selectedRect.left,
                  opacity: isHovering ? 0.85 : 1,
                  top: selectedRect.top,
                  width: selectedRect.width
                }}
                aria-hidden
                className="pointer-events-none absolute z-0 rounded-full bg-muted"
                data-slot="download-filter-selected"
                initial={false}
                transition={selectedTransition}
              />
            ) : null}
            <AnimatePresence>
              {isMeasured && hoverRect && !isHoveringSelected && selectedRect && !reduceMotion ? (
                <motion.div
                  animate={{
                    height: hoverRect.height,
                    left: hoverRect.left,
                    opacity: 0.4,
                    top: hoverRect.top,
                    width: hoverRect.width
                  }}
                  aria-hidden
                  className="pointer-events-none absolute z-0 rounded-full bg-hover"
                  data-slot="download-filter-hover"
                  exit={
                    isMouseInside.current || !selectedRect
                      ? { opacity: 0, transition: spring.fast.exit }
                      : {
                          height: selectedRect.height,
                          left: selectedRect.left,
                          opacity: 0,
                          top: selectedRect.top,
                          transition: {
                            ...spring.moderate,
                            opacity: { duration: 0.06 }
                          },
                          width: selectedRect.width
                        }
                  }
                  initial={{
                    height: selectedRect.height,
                    left: selectedRect.left,
                    opacity: 0,
                    top: selectedRect.top,
                    width: selectedRect.width
                  }}
                  transition={hoverTransition}
                />
              ) : null}
            </AnimatePresence>
            {renderedIndexes.map((filterIndex, visualIndex) => {
              const filter = filters[filterIndex]
              if (!filter) {
                return null
              }
              return (
                <FilterTab
                  filter={filter}
                  index={visualIndex}
                  isActive={activeFilter === filter.key}
                  isHovered={hoveredIndex === visualIndex}
                  key={filter.key}
                  onSelect={(key) => {
                    setOptimisticIdx(visualIndex)
                    onFilterChange(key)
                  }}
                  reduceMotion={reduceMotion}
                  registerItem={registerItem}
                />
              )
            })}
          </div>
          {hasOverflow ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <OverflowTrigger label={overflowLabel} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48 rounded-xl" sideOffset={6}>
                {hiddenIndexes.map((index) => {
                  const filter = filters[index]
                  if (!filter) {
                    return null
                  }
                  return (
                    <DropdownMenuItem
                      className="gap-2 rounded-lg"
                      data-testid={`download-filter-overflow-${filter.key}`}
                      key={filter.key}
                      onSelect={() => onFilterChange(filter.key)}
                    >
                      <FilterTabIcon filter={filter} />
                      <span>{filter.label}</span>
                      <span className="ml-auto font-normal text-muted-foreground text-xs tabular-nums">
                        {filter.count}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
    </div>
  )
}
