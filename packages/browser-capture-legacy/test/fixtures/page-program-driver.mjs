import assert from 'node:assert/strict'
// Sidecar-only preload: real production page programs run in a fresh Chromium context.
import childProcess from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { chromium } from 'playwright-core'

const spawnSync = childProcess.spawnSync
childProcess.spawnSync = (command, args, options) => command === 'which' && args[0] === 'pactl'
  ? { stdout: '', status: 1 } : spawnSync(command, args, options)
syncBuiltinESMExports()
const scenario = process.env.VIDBEE_PAGE_SCENARIO
const snapshotPath = process.env.VIDBEE_PAGE_SNAPSHOT
const video = readFileSync(new URL('./playback.mp4', import.meta.url))
const snapshots = { scenario, quality: null, placement: null, removal: null, clock: null, initScripts: [] }
const save = () => writeFileSync(snapshotPath, JSON.stringify(snapshots))
const html = `<!doctype html><style>
html,body{margin:0;background:black} button{width:100px;height:30px} .b-slideshow{transform:translate(20px,20px)}
</style><video id="decoy"></video><div class="b-slideshow"><div class="swiper-slide-active">${scenario === 'carousel' ? '<button id="carousel-cover">Play 22</button>' : '<img width="0" height="0" style="display:none">'}</div></div>
<button id="attribute-cover" data-media-id="22">0:08</button><div style="transform:translate(40px,40px)"><video id="selected" autoplay muted loop playsinline src="http://127.0.0.1/fixture.mp4"></video></div>
<script>
window.fixture={clicked:[],getterReads:0};
const decoy=document.getElementById('decoy');
for(const [key,value] of Object.entries({duration:99,currentTime:1,paused:false,ended:false,videoWidth:80,videoHeight:60}))Object.defineProperty(decoy,key,{configurable:true,value});
decoy.play=()=>Promise.resolve();decoy.getVideoPlaybackQuality=()=>({totalVideoFrames:30});
window.hls={levels:[{width:1280,height:720,bitrate:1000},{width:1920,height:1080,bitrate:2000}],config:{},currentLevel:-1};
Object.defineProperty(hls,'throwing',{enumerable:true,get(){fixture.getterReads++;throw Error('synthetic getter')}});
window.player={getVariantTracks:()=>[{id:'low',width:640,height:360},{id:'high',width:1920,height:1080}],configure:value=>{fixture.shakaConfig=value},selectVariantTrack:(track,clear)=>{fixture.shakaSelected={id:track.id,clear}}};
window.dashPlayer={getBitrateInfoListFor:type=>[{width:1920,height:1080},{width:3840,height:2160}],updateSettings:value=>{fixture.dashSettings=value},setQualityFor:(type,index)=>{fixture.dashSelected={type,index}}};
Object.defineProperty(window,'shaka',{get(){fixture.getterReads++;throw Error('synthetic global getter')}});
window.deep={levels:[{height:9999}],currentLevel:-1};window.videojs={a:{b:{c:{hls:deep}}}};
const carousel=document.querySelector('.b-slideshow');
carousel.swiper={activeIndex:${scenario === 'carousel' ? '0' : '1'},virtual:{slides:[{key:'11'},{key:'22'}]},slideNext(){this.activeIndex++},slideTo(index){this.activeIndex=index}};
for(const id of ['carousel-cover','attribute-cover'])document.getElementById(id)?.addEventListener('click',()=>fixture.clicked.push(id));
fetch('https://onlyfans.com/api2/v2/chats/7/messages?firstId=100');
</script>`
const messages = { list: [{ id: 100, media: [{ id: 22, type: 'video', duration: 8, files: { drm: { manifest: true } } }] }] }
const launch = chromium.launch.bind(chromium)
chromium.launch = async (options) => {
  assert.equal(options.env.DBUS_SESSION_BUS_ADDRESS, 'disabled:')
  assert.equal(options.env.XDG_RUNTIME_DIR, `${process.env.HOME}/runtime`)
  assert.equal(options.env.PULSE_SERVER, `unix:${process.env.HOME}/runtime/no-pulse`)
  const version = spawnSync('/usr/bin/chromium', ['--version'], { encoding: 'utf8' }).stdout.trim()
  const expectedVersion = JSON.parse(readFileSync(new URL('./audit-chromium-version.json', import.meta.url), 'utf8'))
  assert.equal(version, expectedVersion, `Chromium changed from ${expectedVersion} to ${version}; re-characterize layout before accepting the fixture`)
  const browser = await launch(options)
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async (contextOptions) => {
    const context = await newContext(contextOptions)
    const addInitScript = context.addInitScript.bind(context)
    context.addInitScript = async (program, arg) => {
      snapshots.initScripts.push(typeof program === 'function' ? program.name : 'name-helper')
      save()
      return addInitScript(program, arg)
    }
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://127.0.0.1' && url.pathname === '/fixture.mp4') {
        await route.fulfill({ status: 200, contentType: 'video/mp4', body: video })
      } else if (url.origin === 'https://onlyfans.com' && url.pathname === '/api2/v2/chats/7/messages') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(messages) })
      } else if (url.origin === 'https://onlyfans.com' && url.pathname === '/my/chats/chat/7') {
        await route.fulfill({ status: 200, contentType: 'text/html', body: html })
      } else await route.abort()
    })
    const newPage = context.newPage.bind(context)
    context.newPage = async () => {
      const page = await newPage()
      const evaluate = page.evaluate.bind(page)
      page.evaluate = async (program, arg) => {
        const result = await evaluate(program, arg)
        const source = typeof program === 'function' ? program.toString() : ''
        if (typeof program === 'function' && program.name === 'pinHighestQualityInPage' && snapshots.quality === null) {
          snapshots.quality = await evaluate((quality) => {
            const first = document.getElementById('decoy')
            return {
              result: quality, helper: typeof globalThis.__name,
              hls: { current: hls.currentLevel, next: hls.nextLevel, load: hls.loadLevel, capping: hls.autoLevelCapping, automatic: hls.autoLevelEnabled, capToPlayer: hls.config.capLevelToPlayerSize },
              shaka: { configuration: fixture.shakaConfig, selected: fixture.shakaSelected },
              dash: { settings: fixture.dashSettings, selected: fixture.dashSelected },
              deepLevel: deep.currentLevel, gettersCaught: fixture.getterReads > 0,
              video: { id: first.id, controls: first.controls, muted: first.muted, volume: first.volume, loop: first.loop,
                clientWidth: first.clientWidth, clientHeight: first.clientHeight,
                position: first.style.position, width: first.style.width, height: first.style.height,
                objectFit: first.style.objectFit, zIndex: first.style.zIndex },
              activeIndex: document.querySelector('.b-slideshow').swiper.activeIndex, clicked: fixture.clicked
            }
          }, result)
        }
        if (source.includes('document.createElement') && source.includes('vidbee-grab-mark')) {
          snapshots.placement = await evaluate((rectangle) => ({
            rectangle, selectedParent: document.getElementById('selected').parentElement.tagName,
            decoyParent: document.getElementById('decoy').parentElement.tagName,
            marker: Boolean(document.getElementById('vidbee-grab-mark'))
          }), result)
        }
        if (source.includes('vidbee-grab-mark') && source.includes('remove()')) {
          snapshots.removal = await evaluate(() => ({ marker: Boolean(document.getElementById('vidbee-grab-mark')) }))
        }
        if (result && typeof result === 'object' && 'paused' in result && 'ended' in result && result.currentTime > 0.05 && snapshots.clock === null) {
          snapshots.clock = { expected: arg, duration: result.duration, paused: result.paused, ended: result.ended }
        }
        save()
        return result
      }
      return page
    }
    return context
  }
  return browser
}
