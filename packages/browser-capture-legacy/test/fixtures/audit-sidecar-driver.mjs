// Test-owned preload: public sidecar entry, controlled Playwright and raw Node host seams.
import childProcess from 'node:child_process'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { chromium } from 'playwright-core'
const actualSpawn = childProcess.spawn.bind(childProcess)
const trace = []
const scenario = process.env.VIDBEE_ORACLE_SCENARIO
const actualKill = process.kill.bind(process)
const audit = scenario?.startsWith('audit-')
const originalTimeout = globalThis.setTimeout
const originalStat = fsPromises.stat
const originalExists = fs.existsSync
let time = 1000
Date.now = () => audit ? time : (time += 1000)
const actualReadFile = fsPromises.readFile
fsPromises.readFile = async (...args) => { const value = await actualReadFile(...args); if (String(args[0]).endsWith('cookies.txt')) time = 1700000000000; return value }
globalThis.setTimeout = (callback, ms, ...args) => { const timer = originalTimeout(() => { if (audit) time += ms; callback(...args) }, ms === 4000 ? 10 : 0); trace.push(['timer', ms, timer.hasRef()]); return timer }
fs.existsSync = (p) => p === '/usr/bin/brave' || p === '/fixture/Xvfb' || p === '/fixture/pactl' ? true : String(p).startsWith('/tmp/.X') ? scenario === 'display-exhausted' : originalExists(p)
fsPromises.stat = async (p) => p === '/fixture/output.mp4' ? { size: 3 } : originalStat(p)
childProcess.spawnSync = (command, args, options) => {
  trace.push(['probe', command, args, options])
  return { stdout: command === 'which' && !(scenario === 'recorder-missing' && args[0] === 'pactl') ? `/fixture/${args[0]}\n` : '', status: scenario === 'readiness-timeout' && command === 'xdpyinfo' ? 1 : 0 }
}
process.kill = (pid, signal) => { trace.push(['pid-signal', pid, signal]); return true }
let recorder
childProcess.spawn = (command, args, options) => {
  if (scenario === 'xvfb-missing' && command === '/fixture/Xvfb' || scenario === 'recorder-missing' && command === '/fixture/ffmpeg' && !args.includes('rawvideo')) return actualSpawn('/fixture/missing', args, options)
  trace.push(['spawn', command, args, { ...options, ...(options.env ? { env: { DISPLAY: options.env.DISPLAY, PULSE_SINK: options.env.PULSE_SINK } } : {}) }])
  const child = new EventEmitter()
  child.pid = 42
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough()
  child.kill = (signal) => { trace.push(['child-signal', signal]); if (scenario !== 'early-close') queueMicrotask(() => child.emit('close', 0)); return true }
  if (command === '/fixture/Xvfb') {
    trace.push(['xvfb-observers', child.listenerCount('error'), child.listenerCount('close')])
  } else if (command === '/fixture/pactl') {
    queueMicrotask(() => { trace.push(['pactl-observers', child.stderr.listenerCount('data'), child.listenerCount('error'), child.listenerCount('close')]); child.stdout.emit('data', Buffer.from('  module-id \n')); child.emit('close', 0) })
  } else if (args.includes('rawvideo')) {
    queueMicrotask(() => { trace.push(['scan-observers', child.stdout.listenerCount('data'), child.stderr.listenerCount('data'), child.listenerCount('error'), child.listenerCount('close')]); child.stdout.emit('data', Buffer.from([255, 0, 255])); child.emit('close', 0) })
  } else {
    recorder = child
    if (scenario === 'audit-SIGINT' || scenario === 'audit-SIGTERM') originalTimeout(() => actualKill(process.pid, scenario.slice(6)), 20)
    child.stdin.write = (value) => { trace.push(['stdin-write', value, child.stdin.writableEnded, child.listenerCount('close')]); return false }
    trace.push(['recorder-observers', child.stderr.listenerCount('data'), child.listenerCount('error'), child.listenerCount('close')])
    if (scenario === 'early-close') queueMicrotask(() => { trace.push(['early-close']); child.emit('close', 0) })
  }
  return child
}
const page = {
  async goto(url, options) { trace.push(['goto', url, options]) },
  async waitForSelector(selector, options) { trace.push(['selector', selector, options]) },
  async addStyleTag() {},
  async evaluate(fn) {
    const source = String(fn)
    if (source.includes('currentTime:')) return { currentTime: 1, duration: audit && scenario.includes('SIG') ? 100 : 1, paused: false, ended: !(audit && scenario.includes('SIG')) }
    if (source.includes('vidbee-grab-mark') && source.includes('appendChild')) return { x: 0, y: 0, width: 4, height: 4 }
    if (source.includes('getVideoPlaybackQuality') || source.includes('videoWidth') && !source.includes('currentTime:')) return { fps: 30, width: 4, height: 4, method: 'fixture' }
    return undefined
  }
}
const context = { async addInitScript(program, arg) { trace.push(['init-script', typeof program === 'function' ? program.name : 'name-helper', arg ?? null]) }, async newPage() { return page }, async close() { trace.push(['context-close']) }, async addCookies(cookies) { trace.push(['cookies', cookies]) } }
chromium.launch = async (options) => { trace.push(['browser-launch', { ...options, env: { DISPLAY: options.env.DISPLAY, PULSE_SINK: options.env.PULSE_SINK, XDG_SESSION_TYPE: options.env.XDG_SESSION_TYPE, GDK_BACKEND: options.env.GDK_BACKEND, hasWayland: 'WAYLAND_DISPLAY' in options.env } }]); return { async newContext(options) { trace.push(['context', options]); return context }, async close() { trace.push(['browser-close']) } } }
syncBuiltinESMExports()
process.on('exit', () => { trace.push(['recorder-final-observers', recorder?.listenerCount('close'), recorder?.listenerCount('error')]); process.stdout.write(`__ORACLE__${JSON.stringify(trace)}\n`) })

chromium.launchPersistentContext = async (directory, options) => { trace.push(['persistent', directory, options.executablePath]); return { ...context, pages: () => [page] } }
