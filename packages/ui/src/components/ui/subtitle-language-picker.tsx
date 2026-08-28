import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { Button } from './button'
import { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { ScrollArea } from './scroll-area'

export interface SubtitleLanguageOption {
  label: string
  value: string
  languageTag?: string
}

export interface SubtitleLanguagePickerProps {
  ariaLabel: string
  disabled?: boolean
  emptyLabel: string
  limitLabel: string
  maxSelections: number
  onValueChange: (values: string[]) => void
  options: readonly SubtitleLanguageOption[]
  searchPlaceholder: string
  values: readonly string[]
}

/**
 * Render an accessible searchable multi-select for a bounded subtitle language list.
 *
 * @param props Picker labels, options, selection, and update callback.
 * @returns A popover-based language picker.
 */
export function SubtitleLanguagePicker({
  ariaLabel,
  disabled = false,
  emptyLabel,
  limitLabel,
  maxSelections,
  onValueChange,
  options,
  searchPlaceholder,
  values
}: SubtitleLanguagePickerProps) {
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedValues = useMemo(() => new Set(values), [values])
  const selectedOptions = useMemo(
    () =>
      values.map(
        (value) => options.find((option) => option.value === value) ?? { label: value, value }
      ),
    [options, values]
  )
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) {
      return options
    }
    return options.filter(
      (option) =>
        option.label.toLocaleLowerCase().includes(normalizedQuery) ||
        option.value.toLocaleLowerCase().includes(normalizedQuery)
    )
  }, [options, query])
  const summary =
    selectedOptions.length > 1
      ? `${selectedOptions[0]?.label ?? ''} +${selectedOptions.length - 1}`
      : (selectedOptions[0]?.label ?? emptyLabel)

  /** Toggle one language while preserving at least one selection and the request cap. */
  const toggleValue = (value: string): void => {
    if (selectedValues.has(value)) {
      if (values.length > 1) {
        onValueChange(values.filter((selectedValue) => selectedValue !== value))
      }
      return
    }
    if (values.length >= maxSelections) {
      return
    }
    onValueChange([...values, value])
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-controls={open ? listboxId : undefined}
          aria-expanded={open}
          aria-label={ariaLabel}
          className="w-64 justify-between font-normal"
          disabled={disabled}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="truncate">{summary}</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-2">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={searchPlaceholder}
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            value={query}
          />
        </div>
        <ScrollArea className="h-64">
          <div
            aria-label={ariaLabel}
            aria-multiselectable="true"
            className="space-y-1 pr-3"
            id={listboxId}
            role="listbox"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const selected = selectedValues.has(option.value)
                const selectionLimitReached = !selected && values.length >= maxSelections
                const isLastSelection = selected && values.length === 1
                return (
                  <button
                    aria-selected={selected}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                      (selectionLimitReached || isLastSelection) && 'cursor-not-allowed opacity-50'
                    )}
                    disabled={selectionLimitReached || isLastSelection}
                    key={option.value}
                    onClick={() => toggleValue(option.value)}
                    role="option"
                    type="button"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border',
                        selected && 'border-primary bg-primary text-primary-foreground'
                      )}
                    >
                      {selected && <Check aria-hidden="true" className="size-3" />}
                    </span>
                    <span className="truncate" lang={option.languageTag}>
                      {option.label}
                    </span>
                  </button>
                )
              })
            ) : (
              <p className="px-2 py-6 text-center text-muted-foreground text-sm">{emptyLabel}</p>
            )}
          </div>
        </ScrollArea>
        <p className="px-1 text-muted-foreground text-xs">{limitLabel}</p>
      </PopoverContent>
    </Popover>
  )
}
