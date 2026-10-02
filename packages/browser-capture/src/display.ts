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

/**
 * Environment for a child that must render on the virtual display. Wayland
 * variables are dropped so Chromium's Ozone auto-detection cannot pick the
 * desktop compositor over Xvfb.
 */
export const virtualDisplayEnv = (
  base: NodeJS.ProcessEnv,
  display: string,
  pulseSink?: string
): NodeJS.ProcessEnv => {
  const { WAYLAND_DISPLAY: _waylandDisplay, WAYLAND_SOCKET: _waylandSocket, ...rest } = base
  const env: NodeJS.ProcessEnv = { ...rest, DISPLAY: display, XDG_SESSION_TYPE: 'x11' }
  if (pulseSink) {
    env.PULSE_SINK = pulseSink
  }
  return env
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
