// A populated seed for every pure export and every calculation on the public adapter.
// Replacements walk arguments, option fields, nested arrays and nonempty element fields.
const media = 'https://cdn.onlyfans.com/files/v.mp4?Signature=synthetic'
const item = { id: '2', postId: '1', category: 'videos', state: 'available', downloaded: false }
const profile = { username: 'fixture', profileUrl: 'https://fansly.com/fixture', state: 'idle', updatedAt: 0, pages: 0, items: [item], chatId: '7', chatRoute: 'videos', purchasedUserId: '8', purchasedRoute: 'photos' }
const onlyfans = { list: [{ id: '1', messageId: '3', canViewMedia: true, media: [{ id: '2', type: 'video', duration: '12.5', canView: true, files: { full: { url: media }, source: { url: media }, drm: { manifest: true }, preview: { url: media } }, src: media, videoSources: { 1080: media } }] }] }
const fansly = { response: { posts: [{ id: '1', attachments: [{ contentId: '2' }] }], accountMediaBundles: [{ id: '2', accountMediaIds: ['3'], content: [{ accountMediaId: '4' }] }], accountMedia: [{ id: '2', access: true, media: { mimetype: 'video/mp4', height: 1080, locations: [{ location: 'https://cdn.fansly.com/v.mp4' }], variants: [{ height: 720, mimetype: 'video/mp4', locations: [{ location: 'https://cdn.fansly.com/720.mp4' }] }] } }], aggregationData: { posts: [], accountMedia: [], accountMediaBundles: [] }, data: [{ correlationId: '1', mediaOfferId: '2', mediaOfferBundleId: '2' }], hasMore: false } }
const seeds = [
 ['cookies', 'parseNetscapeCookieFile', ['#HttpOnly_.fixture.test\tTRUE\t/\tTRUE\t2000000000\tsession\tvalue']],
 ['cookies', 'toPlaywrightCookies', [[{ domain: '.fixture.test', path: '/', expires: 2000000000, name: 'session', value: 'value', httpOnly: true, secure: true }]]],
 ['drm', 'capturePageUrl', ['https://onlyfans.com/my/chats/chat/7?firstId=2#hash', 2]],
 ['drm', 'playbackPageUrl', ['https://fixture.test/post/media/2?token=synthetic#hash']],
 ['drm', 'isDrmProtectedMessage', ['Known to use DRM protection']],
 ['quality', 'evenSize', [1919, 1079]],
 ...[
  { type: 'spawn', pid: 12 }, { type: 'log', message: 'synthetic' },
  { type: 'progress', percent: 0.5, currentTime: 2, duration: 4 },
  { type: 'done', filePath: '/synthetic/out.mp4', size: 3, durationMs: 1200 },
  { type: 'error', message: 'synthetic failure' },
 ].map(event => ['protocol', 'encodeSidecarEvent', [event]]),
 ['protocol', 'parseSidecarEvent', ['__VIDBEE_CAPTURE__{"type":"log","message":"synthetic"}']],
 ['protocol', 'parseCaptureJob', [{ url: ' https://fixture.test/video ', outputPath: '/synthetic/out.mp4', ffmpegPath: '/synthetic/ffmpeg', width: 1024, height: 1024, durationHintSec: 12, cookiesPath: '', browserExecutable: '/synthetic/chromium', localStorage: { token: 'synthetic', ignored: 7 }, userDataDir: '/synthetic/profile', videoOrdinal: 2 }]],
 ['recorder', 'buildRecorderArgs', [{ display: ':99', width: 1920, height: 1080, outputPath: '/synthetic/out.mp4', pulseSink: 'synthetic', includeAudio: true, fps: 30, originX: 4, originY: 6 }]],
 ['player', 'playbackHasAdvanced', [{ currentTime: 1, duration: 12, paused: false, ended: false }]],
 ...['onlyFansMediaUrl','onlyFansItems','chatVideoAttachments'].map(name => ['onlyfans_profile', name, [name === 'onlyFansMediaUrl' ? media : onlyfans]]),
 ['onlyfans_profile', 'chatVideoByOrdinal', [onlyfans, 1]],
 ['onlyfans_profile', 'onlyFansChatResponse', [new URL('https://onlyfans.com/api2/v2/chats/7/messages'), '7']],
 ['onlyfans_profile', 'onlyFansChatMediaResponse', [new URL('https://onlyfans.com/api2/v2/chats/7/media?filter=photos'), '7', 'videos']],
 ['onlyfans_profile', 'onlyFansPurchasedResponse', [new URL('https://onlyfans.com/api2/v2/posts/paid?userId=7'), '7']],
 ['fansly_profile', 'fanslyMediaUrl', ['https://cdn.fansly.com/v.mp4?Signature=synthetic']],
 ['fansly_profile', 'fanslyItems', [fansly]],
 ...[
  ['normalize', ['https://www.fansly.com/Fixture/media']], ['isSite', ['https://fansly.com/fixture']], ['items', [fansly]],
  ['ownerResponse', [new URL('https://apiv3.fansly.com/api/v1/account?usernames=fixture'), 'fixture']],
  ['ownerId', [{ response: [{ username: 'fixture', id: '7' }] }, 'fixture']],
  ['feedResponse', [new URL('https://apiv3.fansly.com/api/v1/timeline/7'), '7', profile]],
  ['complete', [fansly]], ['queueUrl', [item, profile]], ['refreshUrl', [item, profile]],
  ['refreshResponse', [new URL('https://apiv3.fansly.com/api/v1/post?ids=1'), item, profile]], ['scrollMode', [profile]],
 ].map(([name,args]) => ['fansly_profile', `fanslyAdapter.${name}`, args])
]

// Original plain facades accept omitted arguments independently of native dual dispatch.
for (const value of [undefined,null,false,true,0,7,NaN,'','text','https://onlyfans.com/my/chats/chat/7']) {
 seeds.push(['drm','capturePageUrl',[value]],['drm','capturePageUrl',[value,undefined]])
 seeds.push(['quality','evenSize',[value]],['quality','evenSize',[value,undefined]])
 seeds.push(['onlyfans_profile','chatVideoByOrdinal',[value]])
 seeds.push(['onlyfans_profile','onlyFansChatResponse',[value]],['onlyfans_profile','onlyFansChatMediaResponse',[value]],['onlyfans_profile','onlyFansPurchasedResponse',[value]])
 seeds.push(['onlyfans_profile','onlyFansChatMediaResponse',[value,'7']],['onlyfans_profile','onlyFansChatMediaResponse',[value,'7',undefined]])
}

const scalars = [undefined, null, false, true, 0, 7, NaN, '', 'text']
export const pack = value => {
 if (value === undefined) return { $capture: 'undefined' }
 if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return { $capture: Object.is(value, -0) ? '-0' : String(value) }
 if (value instanceof URL) return { $capture: 'URL', href: value.href }
 if (Array.isArray(value)) return value.map(pack)
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,entry]) => [key,pack(entry)]))
 return value
}
export const unpack = value => {
 if (value && typeof value === 'object' && '$capture' in value) return value.$capture === 'undefined' ? undefined : value.$capture === 'URL' ? new URL(value.href) : Number(value.$capture)
 if (Array.isArray(value)) return value.map(unpack)
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,entry]) => [key,unpack(entry)]))
 return value
}
const paths = value => {
 if (!value || typeof value !== 'object' || value instanceof URL) return []
 return Object.entries(value).flatMap(([key,entry]) => [[key], ...paths(entry).map(path => [key,...path])])
}
const protocolEvents = [
 { type: 'spawn', pid: 12 }, { type: 'log', message: 'synthetic' },
 { type: 'progress', percent: 0.5, currentTime: 2, duration: 4 },
 { type: 'done', filePath: '/synthetic/out.mp4', size: 3, durationMs: 1200 },
 { type: 'error', message: 'synthetic failure' }, { type: 'future', ignored: 7 },
]
for (const event of protocolEvents) {
 seeds.push(['protocol','parseSidecarEvent',[`__VIDBEE_CAPTURE__${JSON.stringify(event)}`]])
 for (const key of Object.keys(event)) for (const scalar of scalars) {
  seeds.push(['protocol','parseSidecarEvent',[`__VIDBEE_CAPTURE__${JSON.stringify({...event,[key]:scalar})}`]])
 }
}
export const cases = seeds.flatMap(([module,name,args]) => {
 const output = [{ module,name,args }]
 for (const path of paths(args)) for (const scalar of scalars) {
  const copy = unpack(pack(args))
  let target = copy
  for (const key of path.slice(0,-1)) target = target[key]
  target[path.at(-1)] = scalar
  output.push({ module,name,args:copy })
 }
 return output
})
export const call = (modules,entry) => {
 const args = unpack(pack(entry.args))
 let fn = modules[entry.module]
 for (const key of entry.name.split('.')) fn = fn[key]
 try { return { value: fn(...args), postArgs: args } }
 catch (error) { return { error: error?.constructor?.name ?? typeof error, message: error instanceof Error ? error.message : String(error), engine: error instanceof TypeError || error instanceof RangeError, postArgs: args } }
}
