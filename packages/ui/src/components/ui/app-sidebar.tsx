import type * as React from 'react'
import { type RefObject, useRef } from 'react'
import { useProximityHover, useRegisterProximityItem } from '../../hooks/use-proximity-hover'
import { cn } from '../../lib/cn'
import { Button } from './button'
import { DragRegion, NoDrag } from './drag-region'
import { ImageWithPlaceholder } from './image-with-placeholder'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { TravelingHighlight } from './traveling-highlight'

interface AppSidebarIcon {
  active: React.ComponentType<{ className?: string }>
  inactive: React.ComponentType<{ className?: string }>
}

interface AppSidebarItem {
  id: string
  label: string
  icon: AppSidebarIcon
  avatar?: { src: string | null; name: string }
  active?: boolean
  disabled?: boolean
  indicator?: boolean
  showLabel?: boolean
  showTooltip?: boolean
  onClick?: () => void
}

interface AppSidebarProps {
  /** `rail` is the 80px icon rail; `labelled` is a 224px sidebar with text labels. */
  variant?: 'labelled' | 'rail'
  /** Optional sentence-case caption under the product name (scope, version). */
  appCaption?: string
  appName?: string
  logoSrc?: string
  logoAlt?: string
  className?: string
  items: AppSidebarItem[]
  bottomItems?: AppSidebarItem[]
}

interface SidebarNavGroupProps {
  items: AppSidebarItem[]
}

interface SidebarNavItemProps {
  item: AppSidebarItem
  index: number
  hovered: boolean
  registerItem: (index: number, element: HTMLElement | null) => void
}

/**
 * Render one icon-rail button, registering it with the traveling highlight.
 *
 * @param props.item Sidebar destination or action.
 * @param props.index Index of the item inside its nav group.
 * @param props.hovered Whether the pointer is nearest this item.
 * @param props.registerItem Proximity-hover registration callback.
 */
function SidebarNavItem({ item, index, hovered, registerItem }: SidebarNavItemProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const isActive = Boolean(item.active)
  const IconComponent = isActive || hovered ? item.icon.active : item.icon.inactive
  const showLabel = item.showLabel ?? true

  useRegisterProximityItem(registerItem, index, buttonRef as RefObject<HTMLElement | null>)

  const button = (
    <Button
      aria-label={item.label}
      className={cn(
        'relative z-10 h-12 w-12 rounded-2xl hover:bg-transparent hover:text-inherit',
        isActive && 'text-primary'
      )}
      data-proximity-index={index}
      disabled={item.disabled}
      onClick={item.onClick}
      ref={buttonRef}
      size="icon"
      variant="ghost"
    >
      {item.avatar ? (
        <ImageWithPlaceholder
          alt={item.avatar.name}
          className="h-8 w-8 overflow-hidden rounded-full"
          fallbackIcon={<IconComponent className="h-5! w-5!" />}
          imgClassName="h-full w-full object-cover"
          key={item.avatar.src}
          src={item.avatar.src ?? undefined}
        />
      ) : (
        <IconComponent className={cn('h-5! w-5!', isActive && 'text-primary')} />
      )}
      {item.indicator ? (
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500" />
      ) : null}
    </Button>
  )

  return (
    <div className="flex flex-col items-center gap-1">
      {item.showTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{item.label}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}

      {showLabel ? (
        <span className="w-full max-w-20 px-1 text-center text-muted-foreground text-xs leading-tight">
          {item.label}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Render a cluster of rail items that share one traveling highlight.
 *
 * @param props.items Items in this cluster (top destinations or bottom actions).
 */
function SidebarNavGroup({ items }: SidebarNavGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedIndex = items.findIndex((item) => item.active)
  const {
    activeIndex: hoveredIndex,
    itemRects,
    isMeasured,
    sessionRef,
    handlers,
    registerItem
  } = useProximityHover(containerRef)

  if (items.length === 0) {
    return null
  }

  return (
    <NoDrag
      className="relative flex flex-col items-center gap-2"
      data-slot="sidebar-nav-group"
      ref={containerRef}
      {...handlers}
    >
      <TravelingHighlight
        hoveredIndex={hoveredIndex}
        isMeasured={isMeasured}
        itemRects={itemRects}
        selectedIndex={selectedIndex >= 0 ? selectedIndex : null}
        sessionRef={sessionRef}
        shapeClassName="rounded-2xl"
      />
      {items.map((item, index) => (
        <SidebarNavItem
          hovered={hoveredIndex === index}
          index={index}
          item={item}
          key={item.id}
          registerItem={registerItem}
        />
      ))}
    </NoDrag>
  )
}

interface LabelledNavItemProps {
  item: AppSidebarItem
}

/**
 * Render one labelled sidebar row: a 16px outline icon, a 14px label, and the
 * active state as a neutral pill with the label brightened (never the brand hue).
 *
 * @param props.item Sidebar destination or action.
 */
function LabelledNavItem({ item }: LabelledNavItemProps) {
  const isActive = Boolean(item.active)
  const IconComponent = isActive ? item.icon.active : item.icon.inactive

  return (
    <button
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none transition-colors duration-150',
        'focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring)]',
        isActive
          ? 'bg-[color:var(--active)] font-medium text-foreground'
          : 'text-muted-foreground hover:bg-[color:var(--hover)] hover:text-foreground',
        item.disabled && 'pointer-events-none opacity-60'
      )}
      disabled={item.disabled}
      onClick={item.onClick}
      type="button"
    >
      <IconComponent className="h-4! w-4! shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.indicator ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-chart-3" />
      ) : null}
    </button>
  )
}

/**
 * Render the labelled sidebar: product mark and name, primary destinations,
 * and utilities pinned to the bottom.
 */
function LabelledSidebar({
  appName,
  appCaption,
  logoSrc,
  logoAlt,
  className,
  items,
  bottomItems
}: Required<Pick<AppSidebarProps, 'appName' | 'logoSrc' | 'logoAlt' | 'items' | 'bottomItems'>> &
  Pick<AppSidebarProps, 'appCaption' | 'className'>) {
  return (
    <DragRegion
      asChild
      className={cn(
        'flex w-56 min-w-56 max-w-56 flex-col border-sidebar-border border-r bg-sidebar px-3 pt-4 pb-3',
        className
      )}
    >
      <aside>
        <div className="flex items-center gap-2.5 px-2.5 pt-1 pb-5">
          <img alt={logoAlt} className="h-7 w-7 shrink-0 rounded-md" src={logoSrc} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground text-sm leading-5">{appName}</p>
            {appCaption ? (
              <p className="truncate text-muted-foreground text-xs leading-4">{appCaption}</p>
            ) : null}
          </div>
        </div>
        <NoDrag asChild>
          <nav aria-label={appName} className="flex flex-col gap-0.5">
            {items.map((item) => (
              <LabelledNavItem item={item} key={item.id} />
            ))}
          </nav>
        </NoDrag>
        <div className="flex-1" />
        <NoDrag className="flex flex-col gap-0.5">
          {bottomItems.map((item) => (
            <LabelledNavItem item={item} key={item.id} />
          ))}
        </NoDrag>
      </aside>
    </DragRegion>
  )
}

/**
 * Render the shared app icon rail used by desktop and web.
 *
 * @param props.appName Product name under the logo.
 * @param props.logoSrc Logo image URL.
 * @param props.logoAlt Logo alt text.
 * @param props.className Extra classes for the rail.
 * @param props.items Primary destinations.
 * @param props.bottomItems Footer actions such as settings and about.
 */
export function AppSidebar({
  appName = 'App',
  logoSrc = './app-icon.png',
  logoAlt = 'App icon',
  className,
  items,
  bottomItems = [],
  variant = 'rail',
  appCaption
}: AppSidebarProps) {
  if (variant === 'labelled') {
    return (
      <LabelledSidebar
        appCaption={appCaption}
        appName={appName}
        bottomItems={bottomItems}
        className={className}
        items={items}
        logoAlt={logoAlt}
        logoSrc={logoSrc}
      />
    )
  }

  return (
    <DragRegion
      asChild
      className={cn(
        'flex w-20 min-w-20 max-w-20 flex-col items-center gap-2 border-border/60 border-r bg-sidebar py-4',
        className
      )}
    >
      <aside>
        <div className="mt-4 flex flex-col items-center gap-1 py-3">
          <div className="flex h-12 w-12 items-center justify-center">
            <img alt={logoAlt} className="h-10 w-10" src={logoSrc} />
          </div>
          <span className="text-center font-bold text-muted-foreground text-xs leading-tight">
            {appName}
          </span>
        </div>

        <SidebarNavGroup items={items} />

        <div className="flex-1" />

        <SidebarNavGroup items={bottomItems} />
      </aside>
    </DragRegion>
  )
}

export type { AppSidebarIcon, AppSidebarItem, AppSidebarProps }
