import { desktopConsoleFormat } from '../logging/DesktopConsoleFormat'

interface ConsoleFormatInput {
  data: unknown[]
  message?: { date?: Date; scope?: string }
}

/** Compact console prefix: aligned scope, no empty-scope gap. */
export function formatDesktopConsoleLog(input: ConsoleFormatInput): unknown[] {
  return desktopConsoleFormat({
    data: input.data ?? [],
    date: input.message?.date ?? new Date(),
    scope: input.message?.scope ?? ''
  })
}
