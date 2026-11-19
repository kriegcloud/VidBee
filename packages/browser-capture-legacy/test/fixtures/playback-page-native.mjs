import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import * as Programs from "../../../browser-capture/src/playback-page.js";
import { pinHighestQualityInPage, spoofLargePlayerBoxInPage } from "../../../browser-capture/src/quality-page.js";
const fixtureScratchRoot = process.env.TMPDIR || '/tmp';
const freshBrowserDirectory = () => {
  const directory = mkdtempSync(join(fixtureScratchRoot, 'vbp-'));
  const alias = mkdtempSync('/tmp/vbp-');
  rmSync(alias, {recursive: true, force: true});
  symlinkSync(directory, alias, 'dir');
  const paths = {HOME: alias, XDG_CONFIG_HOME: alias, XDG_CACHE_HOME: alias, XDG_DATA_HOME: alias, TMPDIR: alias};
  return {directory, alias, paths, env: {...process.env, ...paths}};
};
const isolated = freshBrowserDirectory();
const directory = isolated.directory;
let context;
try {
  context = await chromium.launchPersistentContext(join(isolated.alias, "profile"), { executablePath: "/usr/bin/chromium", headless: true, env: isolated.env, viewport: { width: 1000, height: 1000 } });
  await context.addInitScript("globalThis.__name = (target) => target");
  await context.addInitScript(spoofLargePlayerBoxInPage);
  await context.route("**/*", (route) => route.abort());
  const page = await context.newPage();
  await page.setContent('<video id="decoy"></video><div style="transform:translate(40px,40px)"><video id="selected"></video></div><div class="b-slideshow"><div class="swiper-slide-active"><button style="width:100px;height:50px">Play</button></div></div>');
  await page.evaluate(() => {
    for (const [id, duration, width, height] of [["decoy", 99, 640, 360], ["selected", 8, 960, 720]]) {
      const video = document.getElementById(id);
      for (const [key, value] of Object.entries({ duration, currentTime: 1, paused: false, ended: false, videoWidth: width, videoHeight: height }))
        Object.defineProperty(video, key, { configurable: true, value });
      video.play = () => Promise.resolve();
    }
    const element = document.querySelector(".b-slideshow");
    element.swiper = { activeIndex: 0, virtual: { slides: [{ key: "11" }, { key: "22" }] }, slideNext() {
      this.activeIndex++;
    } };
  });
  assert.deepEqual(await page.evaluate(Programs.readMediaStateInPage, 8), { currentTime: 1, duration: 8, paused: false, ended: false });
  assert.deepEqual(await page.evaluate(Programs.stepToMedia, "22"), { active: 1, index: 1 });
  assert.notEqual(await page.evaluate(Programs.swiperPointInPage, "22"), null);
  const placed = await page.evaluate(Programs.placeVideoInPage, { expected: 8, width: 960, height: 720 });
  assert.deepEqual(placed, { x: 0, y: 0, width: 960, height: 720 });
  assert.deepEqual(await page.evaluate(() => ({ parent: document.getElementById("selected")?.parentElement?.tagName, marker: Boolean(document.getElementById("vidbee-grab-mark")) })), { parent: "HTML", marker: true });
  await page.evaluate(Programs.removeMarkerInPage);
  assert.equal(await page.evaluate(() => document.getElementById("vidbee-grab-mark")), null);
  const quality = await page.evaluate(pinHighestQualityInPage);
  assert.equal(quality.width, 960);
  assert.equal(quality.height, 540);
} finally {
  await context?.close();
  rmSync(isolated.alias, {recursive: true, force: true});
  rmSync(directory, { recursive: true, force: true });
}
console.log("page programs passed");

// Exercise the opaque driver against another fresh browser, including callback identity.
const [{ PlaywrightLive }, { Playwright, BrowserCallbacks }, { CaptureTimers }, { LegacyTiming }, Effect, Layer, ManagedRuntime] = await Promise.all([
  import('../../../browser-capture/src/Playwright.driver.ts'),
  import('../../../browser-capture/src/Playwright.service.ts'),
  import('../../../browser-capture/src/CaptureTimers.service.ts'),
  import('@vidbee/task-queue/LegacyTiming.service'),
  import('effect/Effect'), import('effect/Layer'), import('effect/ManagedRuntime')
]);
const driverIsolated = freshBrowserDirectory();
const driverDirectory = driverIsolated.directory;
const launchPersistent = chromium.launchPersistentContext.bind(chromium);
let rawContext;
chromium.launchPersistentContext = async (directory, options) => {
  rawContext = await launchPersistent(directory, {...options, headless: true, env: {...options.env, ...driverIsolated.paths}});
  await rawContext.route('**/*', route => route.fulfill({status: 200, contentType: 'text/html', body: '<video></video>'}));
  return rawContext;
};
let runtime;
const callbacks = Layer.succeed(BrowserCallbacks, {sync: effect => runtime.runSync(effect), promise: effect => runtime.runPromise(effect)});
const timers = Layer.succeed(CaptureTimers, {now: Effect.succeed(0), sleep: () => Effect.void, defer: () => Effect.void, after: () => Effect.succeed(Effect.void)});
runtime = ManagedRuntime.make(PlaywrightLive.pipe(Layer.provide(Layer.mergeAll(callbacks, timers, LegacyTiming.layer))));
try {
  const driver = await runtime.runPromise(Playwright);
  const {session, page} = await runtime.runPromise(driver.launch({executablePath: '/usr/bin/chromium', display: ':99', width: 1000, height: 1000, cookies: [], userDataDir: join(driverIsolated.alias, 'profile')}));
  const rawPage = rawContext.pages()[0];
  const count = rawPage.listenerCount('response');
  const trace = [];
  const listener = response => Effect.sync(() => {trace.push(response.url());});
  await runtime.runPromise(page.onResponse(listener));
  await runtime.runPromise(page.onResponse(listener));
  assert.equal(rawPage.listenerCount('response'), count + 2);
  await runtime.runPromise(page.goto('http://127.0.0.1/first', {waitUntil: 'domcontentloaded', timeout: 45000}));
  assert.equal(trace.filter(url => url.endsWith('/first')).length, 2);
  await runtime.runPromise(page.offResponse(listener));
  assert.equal(rawPage.listenerCount('response'), count + 1);
  await runtime.runPromise(page.goto('http://127.0.0.1/second', {waitUntil: 'domcontentloaded', timeout: 45000}));
  assert.equal(trace.filter(url => url.endsWith('/second')).length, 1);
  await runtime.runPromise(page.offResponse(listener));
  assert.equal(rawPage.listenerCount('response'), count);
  await rawPage.evaluate(() => Object.defineProperty(document.querySelector('video'), 'currentTime', {value: Infinity}));
  const error = await runtime.runPromise(page.readMediaState(0).pipe(Effect.flip));
  assert.equal(error._tag, 'BoundaryDecodeError');
  assert.equal(error.legacyMessage, 'Invalid browser mediaClock result');
  const close = rawContext.close.bind(rawContext);
  const sentinel = new Error('close sentinel');
  rawContext.close = () => { throw sentinel; };
  const closeError = await runtime.runPromise(session.close.pipe(Effect.flip));
  assert.equal(closeError.cause, sentinel);
  rawContext.close = () => Promise.reject(sentinel);
  await runtime.runPromise(session.close);
  rawContext.close = close;
  await runtime.runPromise(session.close);
} finally {
  await rawContext?.close();
  await runtime.dispose();
  chromium.launchPersistentContext = launchPersistent;
  rmSync(driverIsolated.alias, {recursive: true, force: true});
  rmSync(driverDirectory, {recursive: true, force: true});
}
console.log('opaque driver passed');
