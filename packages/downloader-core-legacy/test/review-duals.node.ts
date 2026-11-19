import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as HashMap from "effect/HashMap";
import * as HashSet from "effect/HashSet";
import { posix } from "node:path";
const result=()=>({exitCode:0,stderr:"",directoryMetadata:[],sourceIds:HashSet.empty(),assetCount:0,parseError:false,items:HashMap.empty(),itemOrder:[]});
const cases:Record<string,()=>unknown[]>={
 pickPreferredAudioFormatId:()=>[[{formatId:"1",language:"en"}],"en"],
 buildBrowserCookiesSetting:()=>["chrome","Default"],
 getBrowserProfileBaseDirs:()=>["win32","C:\\Users\\fixture","chrome"],
 getBrowserProfileCandidates:()=>["win32","C:\\Users\\fixture","chrome"],
 isBrowserCookieReadSupported:()=>["win32","chrome"],hasConfiguredCookieSettings:()=>["none","/cookies"],
 inspectNetscapeCookies:()=>["# Netscape HTTP Cookie File",1000,"/cookies"],
 matchCookieSites:()=>[[],1000],cookieDomainMatches:()=>["example.invalid",".example.invalid"],
 cookieMatchesUrlScope:()=>[".example.invalid","https://example.invalid"],
 applyViaVidBeeFilename:()=>["file.mp4",true],resolveFilenameTemplate:()=>["pretty","video",false,true],
 resolvePlaylistContainerFormat:()=>["video","mp4","mkv"],filterFormatsByType:()=>[[],"video"],
 buildSingleVideoFormatSelector:()=>["137",{ext:"mp4",vcodec:"avc1",acodec:"none"}],
 isMappedProfilePostUrl:()=>["threads","https://threads.com/@fixture/post/ABCDEF"],
 onlyFansChatUrl:()=>["123","messages"],onlyFansPurchasedUrl:()=>["123","all"],
 sanitizeFolderName:()=>["bad/name","Video"],resolveAutoVideoDownloadPath:()=>["/downloads",{uploader:"fixture"},false],
 mapPlaylistInfo:()=>[{entries:[{url:"https://fixture.invalid/v"}]},"fallback"],playlistEntryGroupKey:()=>[{mediaKind:"recording"},"playlist"],
 snapchatCategoryUrl:()=>["fixture","stories"],snapchatStorySnapUrl:()=>["fixture","snap-id"],snapchatSpotlightUrl:()=>["fixture","spotlight-id"],
 resolveSubtitleLanguages:()=>[["en"],"en"],vscoPostUrl:()=>["fixture","123abc",false],
 resolveDownloadSubtitleLanguages:()=>[["en"],"https://youtube.com/watch?v=abc",true],
 resolveSubtitleDownloadSkipReason:()=>[{type:"video",url:"https://twitch.tv/fixture"},{downloadSubtitles:true},"none"],
 resolvePathWithHome:()=>["~/downloads","/fixture/home",posix],
 sanitizeFilenameTemplateWithFallback:()=>["bad..","%(title)s.%(ext)s"],
 appendPlatformFilenameSafetyArgs:()=>[[],"win32"],appendYouTubeSafeExtractorArgs:()=>[[],"https://youtube.com/watch?v=abc"],
 resolveFfmpegLocationFromPath:()=>["/bin/ffmpeg",posix],
 resolveThumbnailDownloadArgs:()=>["video","webm",true],cookieSourcesFromArgs:()=>[["--cookies","/cookies"],{}],
 resolveDownloadTaskKind:()=>["https://threads.com/@fixture/post/ABCDEF","video"],
 resolveGalleryDlFilenameTemplate:()=>["https://pinterest.com/pin/123/",{}],
 parseGalleryJsonMessage:()=>[[3,"https://cdn.invalid/v",{id:"1"}],result()],
 inspectionFailureCode:()=>["login required",false],toCategorySummary:()=>["posts",result()],buildInstagramCategoryUrl:()=>["fixture","posts"]
};
const inventory: {module:string;name:string}[]=JSON.parse(readFileSync(new URL("./fixtures/review-duals.json",import.meta.url),"utf8"));
for(const entry of inventory){
 if(entry.name==="finalizeProfile")continue; // Both forms execute in review-cleanup.effect.test.ts.
 test(`review dual ${entry.module}.${entry.name}`,async()=>{
  const mod=await import(`../../downloader-core/src/${entry.module}.ts`);
  const factory=cases[entry.name];assert.ok(factory,"Missing both-form fixture");
  const first=factory(),last=factory();
  const dataFirst=mod[entry.name](...first);
  const curried=mod[entry.name](...last.slice(1));assert.equal(typeof curried,"function");
  const dataLast=curried(last[0]);
  assert.deepEqual(dataLast,dataFirst);assert.deepEqual(last,first);
 });
}
test("review inspectNetscapeCookies supports omitted optional path in both forms",async()=>{
 const {inspectNetscapeCookies}=await import("../../downloader-core/src/cookie-setup");
 assert.deepEqual(inspectNetscapeCookies(1000)("bad"),inspectNetscapeCookies("bad",1000));
});

test("review formerly ambiguous helpers use one strict options object and preserve legacy positional calls",async()=>{
 const native=await import("../../downloader-core/src/download-file");
 const legacy=await import("../src/download-file");
 for(const savedFileName of [undefined,"","movie.f137.mp4"]){
  assert.deepEqual(native.buildFileNameCandidates({title:"movie",format:"mp4",savedFileName}),legacy.buildFileNameCandidates("movie","mp4",savedFileName));
  assert.deepEqual(native.buildFilePathCandidates({downloadPath:"C:\\Downloads",title:"movie",format:"mp4",savedFileName}),legacy.buildFilePathCandidates("C:\\Downloads","movie","mp4",savedFileName));
 }
 const nativeArgs=await import("../../downloader-core/src/yt-dlp-args");
 const legacyArgs=await import("../src/yt-dlp-args");
 const Result=await import("effect/Result");
 for(const startTime of [undefined,"","5","bad"])for(const endTime of [undefined,"","10","1"]){
  const decoded=nativeArgs.validateDownloadTimeRange({startTime,endTime});
  if(Result.isFailure(decoded))assert.throws(()=>legacyArgs.validateDownloadTimeRange(startTime,endTime),{message:decoded.failure.legacyMessage});
  else assert.equal(legacyArgs.validateDownloadTimeRange(startTime,endTime),undefined);
 }
});
