import type * as OldCookies from '../test/fixtures/legacy-declarations/cookies'
import type * as OldProtocol from '../test/fixtures/legacy-declarations/protocol'
import type * as OldProfile from '../test/fixtures/legacy-declarations/onlyfans-profile'
import type * as OldQuality from '../test/fixtures/legacy-declarations/quality'
import type * as Cookies from '../../browser-capture/src/Cookies.model.js'
import type * as Protocol from '../../browser-capture/src/Protocol.model.js'
import type * as Capture from '../../browser-capture/src/Capture.model.js'
import type * as Profile from '../../browser-capture/src/Profile.model.js'
import type * as PublicProfile from '../../browser-capture/src/onlyfans-profile.js'
import type * as Playback from '../../browser-capture/src/Playback.model.js'
type Assert<T extends true> = T
type Assignable<A,B> = [A] extends [B] ? true : false
export type CookieForward=Assert<Assignable<OldCookies.NetscapeCookieRow,Cookies.NetscapeCookieRow>>
export type CookieBackward=Assert<Assignable<Cookies.NetscapeCookieRow,OldCookies.NetscapeCookieRow>>
export type PlaywrightCookieForward=Assert<Assignable<OldCookies.PlaywrightCookie,Cookies.PlaywrightCookie>>
export type PlaywrightCookieBackward=Assert<Assignable<Cookies.PlaywrightCookie,OldCookies.PlaywrightCookie>>
export type JobForward=Assert<Assignable<OldProtocol.CaptureJob,Capture.CaptureJob>>
export type JobBackward=Assert<Assignable<Capture.CaptureJob,OldProtocol.CaptureJob>>
export type EventForward=Assert<Assignable<OldProtocol.SidecarEvent,Protocol.SidecarEvent>>
export type EventBackward=Assert<Assignable<Protocol.SidecarEvent,OldProtocol.SidecarEvent>>
export type AttachmentForward=Assert<Assignable<OldProfile.ChatVideoAttachment,Profile.ChatVideoAttachment>>
export type AttachmentBackward=Assert<Assignable<Profile.ChatVideoAttachment,OldProfile.ChatVideoAttachment>>
export type AdapterForward=Assert<Assignable<OldProfile.BrowserProfileAdapter,PublicProfile.BrowserProfileAdapter>>
export type AdapterBackward=Assert<Assignable<PublicProfile.BrowserProfileAdapter,OldProfile.BrowserProfileAdapter>>
export type QualityForward=Assert<Assignable<OldQuality.DecodedQuality,Playback.DecodedQuality>>
export type QualityBackward=Assert<Assignable<Playback.DecodedQuality,OldQuality.DecodedQuality>>
// Explicit writes catch readonly drift that TypeScript structural assignability permits.
export const mutateModels=(job:Capture.CaptureJob,event:Protocol.SidecarEvent,attachment:Profile.ChatVideoAttachment,cookie:Cookies.PlaywrightCookie,quality:Playback.DecodedQuality):void=>{
 job.width=1920;job.localStorage??={};job.localStorage.synthetic='value';job.videoOrdinal=undefined
 event.type=event.type
 if(event.type==='done'){event.durationMs=null;event.filePath='/synthetic/output.mp4'}
 attachment.state='available';attachment.durationSec=null
 cookie.path='/';cookie.sameSite='Lax';quality.width=1920
}

// Player wrappers retain their source-level signatures and mutable observations.
import type * as OldPlayer from '../test/fixtures/legacy-declarations/player'
import type * as OldRecorder from '../test/fixtures/legacy-declarations/recorder'
import type * as Player from './player.js'
import type * as Recorder from './recorder.js'
export type ClockForward=Assert<Assignable<OldPlayer.MediaClock,Player.MediaClock>>
export type ClockBackward=Assert<Assignable<Player.MediaClock,OldPlayer.MediaClock>>
export type PlaybackSessionForward=Assert<Assignable<OldPlayer.PlaybackSession,Player.PlaybackSession>>
export type PlaybackSessionBackward=Assert<Assignable<Player.PlaybackSession,OldPlayer.PlaybackSession>>
export type PlaybackStartForward=Assert<Assignable<typeof OldPlayer.startPlayback,typeof Player.startPlayback>>
export type PlaybackStartBackward=Assert<Assignable<typeof Player.startPlayback,typeof OldPlayer.startPlayback>>
export type PlaybackWaitForward=Assert<Assignable<typeof OldPlayer.waitUntilPlaybackAdvances,typeof Player.waitUntilPlaybackAdvances>>
export type PlaybackWaitBackward=Assert<Assignable<typeof Player.waitUntilPlaybackAdvances,typeof OldPlayer.waitUntilPlaybackAdvances>>
export type PlaybackAdvancedForward=Assert<Assignable<typeof OldPlayer.playbackHasAdvanced,typeof Player.playbackHasAdvanced>>
export type PlaybackAdvancedBackward=Assert<Assignable<typeof Player.playbackHasAdvanced,typeof OldPlayer.playbackHasAdvanced>>
export type ScanForward=Assert<Assignable<typeof OldRecorder.measureGrabOrigin,typeof Recorder.measureGrabOrigin>>
export type ScanBackward=Assert<Assignable<typeof Recorder.measureGrabOrigin,typeof OldRecorder.measureGrabOrigin>>
export const mutatePlaybackModels=(clock:Player.MediaClock,playing:Awaited<ReturnType<Player.PlaybackSession['waitUntilPlaying']>>,position:Awaited<ReturnType<typeof Recorder.measureGrabOrigin>>):void=>{
 clock.currentTime=1;clock.duration=2;clock.paused=false;clock.ended=true
 playing.width=960;playing.height=720;playing.fps=30;playing.method='fixture';playing.duration=2;playing.originX=0;playing.originY=0
 position.x=1;position.y=2
}

export const mutatePlaybackInput=(input:Parameters<typeof Player.startPlayback>[0],poll:Parameters<typeof Player.waitUntilPlaybackAdvances>[1]):void=>{
 input.url='https://fixture.invalid';input.width=960;input.height=720;input.display=':99';input.ffmpegPath='/fixture/ffmpeg';input.executablePath='/fixture/chrome'
 input.cookies[0].path='/';input.localStorage??={};input.localStorage.fixture='value';input.pulseSink=undefined;input.videoOrdinal=undefined;input.userDataDir=undefined
 poll.timeoutMs=1;poll.signal=input.signal;poll.sleep=async()=>undefined
}

import type * as RecorderModels from '../../browser-capture/src/Recorder.model.js'
import type * as RecorderFacade from './recorder.js'
export type RecorderForward=Assert<Assignable<Parameters<typeof OldRecorder.startRecorder>,Parameters<typeof RecorderFacade.startRecorder>>>
export type RecorderBackward=Assert<Assignable<Parameters<typeof RecorderFacade.startRecorder>,Parameters<typeof OldRecorder.startRecorder>>>
export type RecorderArgsForward=Assert<Assignable<Parameters<typeof OldRecorder.buildRecorderArgs>,Parameters<typeof RecorderFacade.buildRecorderArgs>>>
export type RecorderArgsBackward=Assert<Assignable<Parameters<typeof RecorderFacade.buildRecorderArgs>,Parameters<typeof OldRecorder.buildRecorderArgs>>>
export const mutateRecorderInputs=(input:RecorderModels.RecorderStart,scan:RecorderModels.ScanInput):void=>{
 input.width=1920;input.pulseSink=undefined;input.env??={};input.env.SYNTHETIC='fixture';scan.scanWidth=1024
}
import type * as OldDrm from '../test/fixtures/legacy-declarations/drm'
import type * as NewDrm from './drm.js'
import type * as NewQuality from './quality.js'
import type * as NewProfile from './onlyfans-profile.js'
export type CapturePageSignature=Assert<Assignable<typeof OldDrm.capturePageUrl,typeof NewDrm.capturePageUrl>>
export type CapturePageSignatureBack=Assert<Assignable<typeof NewDrm.capturePageUrl,typeof OldDrm.capturePageUrl>>
export type EvenSizeSignature=Assert<Assignable<typeof OldQuality.evenSize,typeof NewQuality.evenSize>>
export type EvenSizeSignatureBack=Assert<Assignable<typeof NewQuality.evenSize,typeof OldQuality.evenSize>>
export type ChatOrdinalSignature=Assert<Assignable<typeof OldProfile.chatVideoByOrdinal,typeof NewProfile.chatVideoByOrdinal>>
export type ChatOrdinalSignatureBack=Assert<Assignable<typeof NewProfile.chatVideoByOrdinal,typeof OldProfile.chatVideoByOrdinal>>
export type ChatMediaSignature=Assert<Assignable<typeof OldProfile.onlyFansChatMediaResponse,typeof NewProfile.onlyFansChatMediaResponse>>
export type ChatMediaSignatureBack=Assert<Assignable<typeof NewProfile.onlyFansChatMediaResponse,typeof OldProfile.onlyFansChatMediaResponse>>
