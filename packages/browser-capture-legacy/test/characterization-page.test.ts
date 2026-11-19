import { isolatedEnvironment, runOffline } from './fixtures/audit-offline.js'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from '@effect/vitest'
import { NODE } from './fixtures/node-runtime.js'
import { offline, REAL_BROWSER_SKIP } from './fixtures/real-browser.js'

// These run the public sidecar and serialized production functions in a real headed browser.
// The preload supplies synthetic pages/player objects and observes evaluations; no source import.
describe('public sidecar real page-program characterization', () => {
  it.skipIf(REAL_BROWSER_SKIP !== false).each(['carousel', 'cover'])('pins DOM state and duration-selected placement for %s', async (scenario) => {
    const directory = mkdtempSync('/tmp/vbp-')
    try {
      const jobPath = path.join(directory, 'job.json')
      const outputPath = path.join(directory, 'capture.mp4')
      const snapshotPath = path.join(directory, 'page.json')
      writeFileSync(jobPath, JSON.stringify({
        url: 'https://onlyfans.com/my/chats/chat/7?firstId=100', videoOrdinal: 1,
        outputPath, ffmpegPath: '/usr/bin/ffmpeg', browserExecutable: '/usr/bin/chromium',
        width: 1024, height: 1024, durationHintSec: 8
      }))
      const program = `process.argv=['node','sidecar','--job',${JSON.stringify(jobPath)}];await import('@vidbee/browser-capture-legacy/sidecar')`
      const result = await runOffline(...offline(NODE, [
        '--import', 'tsx', '--import', new URL('./fixtures/page-program-driver.mjs', import.meta.url).href,
        '--input-type=module', '-e', program
      ]), { ...isolatedEnvironment(directory), VIDBEE_PAGE_SCENARIO: scenario, VIDBEE_PAGE_SNAPSHOT: snapshotPath })
      expect(result.error, result.stdout + result.stderr).toBeUndefined()
      expect(result.status, result.stdout + result.stderr).toBe(0)
      const snapshots: unknown = JSON.parse(readFileSync(snapshotPath, 'utf8'))
      expect(snapshots).toEqual({
        scenario,
        initScripts: ['name-helper', 'spoofLargePlayerBoxInPage'],
        quality: {
          result: { fps: 30, height: 720, method: 'hls:1080,shaka:1080,dash:2160', width: 960 },
          helper: 'function',
          hls: { current: 1, next: 1, load: 1, capping: -1, automatic: false, capToPlayer: false },
          shaka: { configuration: { abr: { enabled: false } }, selected: { id: 'high', clear: true } },
          dash: { settings: { streaming: { abr: { autoSwitchBitrate: { audio: false, video: false } } } }, selected: { type: 'video', index: 1 } },
          deepLevel: -1, gettersCaught: true,
          video: { id: 'decoy', controls: false, muted: false, volume: 1, loop: false,
            clientWidth: 3840, clientHeight: 3840, position: 'fixed', width: '960px', height: '720px',
            objectFit: 'fill', zIndex: '2147483647' },
          activeIndex: 1, clicked: [scenario === 'carousel' ? 'carousel-cover' : 'attribute-cover']
        },
        placement: { rectangle: { x: 0, y: 0, width: 960, height: 720 }, selectedParent: 'HTML', decoyParent: 'BODY', marker: true },
        removal: { marker: false },
        clock: { expected: 8, duration: 8, paused: false, ended: false }
      })
      expect(result.stdout).toContain('Opened OnlyFans media 22')
      expect(result.stdout).toContain('Pinned decoded quality 960x720 (hls:1080,shaka:1080,dash:2160)')
      expect(result.stdout).toMatch(/Grab origin \d+,\d+ video 960x720/)
      expect(result.stdout).toContain('"durationMs":8000')
      const probe = spawnSync('/usr/bin/ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,codec_type', '-of', 'json', outputPath], { encoding: 'utf8', timeout: 10000 })
      expect(probe.status, probe.stderr).toBe(0)
      expect(JSON.parse(probe.stdout).streams).toEqual([{ codec_name: 'h264', codec_type: 'video', width: 960, height: 720 }])
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  }, 240000)
})
