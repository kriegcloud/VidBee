// Test-only preload. Public sidecar owns the actual pactl and recorder calls.
import childProcess from 'node:child_process'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
const actualSpawn = childProcess.spawn.bind(childProcess)
const actualKill = process.kill.bind(process)
const originalExists = fs.existsSync
const root = process.env.VIDBEE_PROCESS_ROOT
const site = process.env.VIDBEE_PROCESS_SITE
const drained = process.env.VIDBEE_PROCESS_DRAIN === '1'
const childScript = fileURLToPath(new URL('./sidecar-real-child.mjs', import.meta.url))
const trace = (event) => fs.appendFileSync(path.join(root, 'control.jsonl'), JSON.stringify({ site: 'host', ...event }) + '\n')
const originalTimeout = globalThis.setTimeout
let time = 1000
let recorderStarted = false
Date.now = () => (time += 1000)
globalThis.setTimeout = (callback, ms, ...args) => originalTimeout(callback, [200, 300, 350, 400].includes(ms) ? 1 : ms, ...args)
fs.existsSync = (value) => value === '/fixture/Xvfb' || value === '/fixture/pactl' ? true : String(value).startsWith('/tmp/.X') ? false : originalExists(value)
childProcess.spawnSync = (command, args) => ({ stdout: command === 'which' ? `/fixture/${args[0]}\n` : '', status: 0 })
process.kill = (pid, signal) => pid === 424242 ? true : actualKill(pid, signal)
childProcess.spawn = (command, args, options) => {
  if (command === '/fixture/Xvfb' || args.includes('rawvideo')) {
    const child = Object.assign(new EventEmitter(), { pid: 424242, stdout: new PassThrough(), stderr: new PassThrough() })
    if (args.includes('rawvideo')) queueMicrotask(() => { child.stdout.emit('data', Buffer.from([255, 0, 255])); child.emit('close', 0) })
    return child
  }
  const kind = command === '/fixture/pactl' ? 'pactl' : 'recorder'
  const child = actualSpawn(process.execPath, [childScript, root, kind, ...args], options)
  trace({ event: 'owned-child', kind, pid: child.pid, stdio: options.stdio })
  if (kind === 'recorder') recorderStarted = true
  if (kind === site && drained && !(kind === 'pactl' && args[0] === 'unload-module')) {
    let bytes = 0
    child.stderr.on('data', (chunk) => { bytes += chunk.length })
    child.stderr.once('end', () => trace({ event: 'control-bytes', kind, bytes }))
    trace({ event: 'control-drain', kind })
  }
  return child
}
const waitForRecordingObservation = async () => {
  const milestone = path.join(root, `${site}.${drained ? 'complete' : 'inspect'}`)
  const deadline = performance.now() + 10_000
  while (!originalExists(milestone)) {
    if (performance.now() > deadline) throw new Error('Owned recorder did not reach its control milestone')
    await new Promise((resolve) => originalTimeout(resolve, 5))
  }
  if (!drained) {
    // The outer harness writes inspect only after observing backpressure. Wait
    // for the child's separate control acknowledgement before ending playback.
    while (!fs.readFileSync(path.join(root, 'control.jsonl'), 'utf8').includes('"event":"inspection"')) {
      if (performance.now() > deadline) throw new Error('Owned recorder did not acknowledge inspection')
      await new Promise((resolve) => originalTimeout(resolve, 5))
    }
  }
}
const page = {
  async goto() {}, async waitForSelector() {}, async addStyleTag() {},
  async evaluate(fn) {
    const source = String(fn)
    if (source.includes('currentTime:')) {
      if (recorderStarted) {
        const deadline = performance.now() + 10_000
        while (!fs.readFileSync(path.join(root, 'control.jsonl'), 'utf8').includes('"site":"recorder","event":"ready"')) {
          if (performance.now() > deadline) throw new Error('Owned recorder did not initialize')
          await new Promise((resolve) => originalTimeout(resolve, 5))
        }
        if (site === 'recorder') await waitForRecordingObservation()
      }
      return { currentTime: 1, duration: 1, paused: false, ended: recorderStarted }
    }
    if (source.includes('vidbee-grab-mark') && source.includes('appendChild')) return { x: 0, y: 0, width: 4, height: 4 }
    if (source.includes('getVideoPlaybackQuality') || source.includes('videoWidth') && !source.includes('currentTime:')) return { fps: 30, width: 4, height: 4, method: 'fixture' }
  }
}
const context = { async addInitScript() {}, async newPage() { return page }, async close() {}, async addCookies() {} }
chromium.launch = async () => ({ async newContext() { return context }, async close() {} })
syncBuiltinESMExports()
