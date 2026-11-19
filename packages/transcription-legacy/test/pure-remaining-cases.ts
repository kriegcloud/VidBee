const word={text:'hello',startMs:0,endMs:100}
const chunk={index:0,startMs:0,endMs:100,speakerKey:'speaker-1',text:'hello',words:[word],confidence:null}
const manifest={key:{taskId:'task',fingerprint:'10:20',modelVersion:'fixture'},durationMs:100,speakers:[{speakerKey:'speaker-1',displayName:'Speaker 1'}],turns:[{startMs:0,endMs:100,speakerKey:'speaker-1'}],chunks:[chunk],stages:[{stage:'recognizing',startedAt:100}]}
const options={provider:'cloud',cloudModelId:'fixture-model',downloadTaskId:'download',sourceFilePath:'/fixture/media.wav',trigger:'manual',skipVad:true,asrTier:'quality',language:' zh-Hant ',speakerCount:2,rediarize:true,title:'Fixture',creation:{origin:'manual',requestId:'fixture-request'}}
export const remainingSeeds:Record<string,Record<string,unknown[][]>>={
'extract-captions':{ffprobePathFromFfmpeg:[['/fixture/bin/ffmpeg'],['/fixture/bin/ffmpeg.exe']]},
'worker/protocol':{encodeMessage:[[{type:'probe',modelsDir:'/fixture/models',asrTier:'minimal'}]],parseMessage:[[' {\"type\":\"cancel\"} '],['null'],['false'],['invalid']]},
'audio':{isReusableExtractedWav:[[1000,1000],[1000,0]]},
'cloud-runner':{cloudClipWav:[[new Uint8Array([0,0,1,0,255,127])],[new Uint8Array(0)]]},
'chunk-manifest':{manifestWorkKey:[['task','10:20','fixture'],['中文\u0000task','long'.repeat(50),'v']],chunkKey:[[100,200]],completedChunkKeys:[[manifest]],resultFromManifest:[[manifest]]},
'runtime':{isElectronBinary:[['/fixture/Electron']],nodeBinaryName:[['linux'],['win32']],nodeVersionMeetsBaseline:[['22.23.4',18]],formatRuntimeLog:[[{execPath:'/fixture/node',layer:'bundled',version:'v22.23.4',guarded:true},2]]},
// Zero-duration turn permits the exhaustive maxChunkMs scalar matrix without
// executing the old infinite loop at maxChunkMs=0 on a positive-length turn.
'pipeline-sherpa':{splitTurnForAsr:[[{startMs:100,endMs:100,retained:'fixture'},15000]]},
'model-manager':{isModelDownloadCancelled:[[new Error('download cancelled')],['operation was aborted'],['fixture']]},
'options':{isTranscriptionTrigger:[['manual']],readTranscriptionOptions:[[{url:'file:///fixture/media.wav',kind:'transcription',options}]],buildTranscriptionInput:[[options]]},
'speaker-embed':{embeddingIdForLanguage:[['zh']]},
'asr-json':{isJsonControlCharError:[['Bad control character in string literal']],escapeJsonStringControlChars:[['{"text":"hello\nworld\t!","other":"\\\\path"}']]},
}
