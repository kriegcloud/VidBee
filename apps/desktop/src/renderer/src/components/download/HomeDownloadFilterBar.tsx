import type { DownloadFilterItem } from '@vidbee/ui/components/ui/download-filter-bar'
import { DownloadPlatformIcon } from '@vidbee/ui/components/ui/download-platform-icon'
import type { ReactNode } from 'react'
import { Button } from '../ui/button'

/** Neutral source filters; scrolling keeps every source reachable on narrow windows. */
export function HomeDownloadFilterBar({
  filters,
  activeFilter,
  onFilterChange,
  actions,
  overflowLabel
}: {
  filters: DownloadFilterItem<string>[]
  activeFilter: string
  onFilterChange: (filter: string) => void
  actions?: ReactNode
  overflowLabel: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <fieldset
        aria-label={overflowLabel}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {filters.map((filter) => (
          <Button
            aria-pressed={filter.key === activeFilter}
            className={`h-8 shrink-0 gap-1.5 rounded-md border-0 px-2.5 text-xs shadow-none hover:bg-[color:var(--hover)] ${filter.key === activeFilter ? 'bg-[color:var(--active)] text-foreground hover:bg-[color:var(--active)]' : 'text-muted-foreground'}`}
            key={filter.key}
            onClick={() => onFilterChange(filter.key)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {filter.icon ??
              (filter.domain ? (
                <DownloadPlatformIcon className="size-3.5" domain={filter.domain} />
              ) : null)}
            {filter.label}
            {filter.key !== 'all' && (
              <span className="font-normal text-meta tabular-nums">{filter.count}</span>
            )}
          </Button>
        ))}
      </fieldset>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  )
}
