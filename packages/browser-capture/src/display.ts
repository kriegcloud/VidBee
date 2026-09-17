import { type ChildProcess, spawn } from 'node:child_process'
import {
  pickDisplayNumber,
  resolvePactlPath,
  resolveXvfbPath,
  waitForDisplay
} from './availability'

export interface VirtualDisplay {
  display: string
  pulseSink?: string
  stop: () => Promise<void>
}

const killChild = (child: ChildProcess | null, signal: NodeJS.Signals = 'SIGTERM'): void => {
  if (!child?.pid) {
    return
  }
  try {
    process.kill(child.pid, signal)
  } catch {
    /* already gone */
  }
}

const runPactl = (args: string[]): Promise<string> => {
  const pactl = resolvePactlPath()
  if (!pactl) {
    return Promise.resolve('')
  }
  return new Promise((resolve) => {
    const child = spawn(pactl, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.on('error', () => resolve(''))
    child.on('close', (code) => {
      resolve(code === 0 ? stdout.trim() : '')
    })
  })
}

/**
 * Start Xvfb (and an optional Pulse null sink) for headed Chromium capture.
 */
export const startVirtualDisplay = async (input: {
  width: number
  height: number
}): Promise<VirtualDisplay> => {
  const xvfb = resolveXvfbPath()
  if (!xvfb) {
    throw new Error('Xvfb not found. Install xvfb to record DRM playback.')
  }
  const displayNumber = pickDisplayNumber()
  const display = `:${displayNumber}`
  const xvfbProc = spawn(
    xvfb,
    [display, '-screen', '0', `${input.width}x${input.height}x24`, '-ac', '-nolisten', 'tcp'],
    { stdio: 'ignore' }
  )
  if (!xvfbProc.pid) {
    throw new Error('Failed to start Xvfb')
  }
  await waitForDisplay(display)

  const pulseName = `vidbee_cap_${displayNumber}`
  const pulseModuleId = await runPactl([
    'load-module',
    'module-null-sink',
    `sink_name=${pulseName}`,
    `sink_properties=device.description=${pulseName}`
  ])

  return {
    display,
    pulseSink: pulseModuleId ? pulseName : undefined,
    stop: async () => {
      if (pulseModuleId) {
        await runPactl(['unload-module', pulseModuleId])
      }
      killChild(xvfbProc, 'SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 200))
      killChild(xvfbProc, 'SIGKILL')
    }
  }
}
