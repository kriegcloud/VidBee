const paths = {
  decoder: '/fixture/asr/decoder.int8.onnx',
  encoder: '/fixture/asr/encoder.int8.onnx',
  frontend: '/fixture/asr/conv_frontend.onnx',
  joiner: '/fixture/asr/joiner.int8.onnx',
  model: '/fixture/asr/model.int8.onnx',
  tokenizer: '/fixture/asr/tokenizer',
  tokens: '/fixture/asr/tokens.txt'
}
const nvidia = { active: true, deviceString: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090)', vendorId: 0x10de, vendorString: 'NVIDIA Corporation' }
const intel = { active: false, deviceString: 'Intel Iris Xe', vendorId: 0x8086, vendorString: 'Intel' }
const apple = { active: true, deviceString: 'ANGLE (Apple, Apple M4 Max, Metal Renderer: Apple M4 Max)', vendorId: 0x106b, vendorString: 'Apple' }
const profile = { arch: 'x64', cpuModel: 'AMD Ryzen 9', devices: [intel, nvidia], gpu: 'nvidia', gpuName: 'NVIDIA GeForce RTX 4090', platform: 'linux' }
const spec = { fileName: 'sherpa-onnx-whisper-tiny/tiny-encoder.int8.onnx', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2' }

/** Full data-first calls; the parent oracle supplies scalar substitutions. */
export const asrSeeds: Record<string, Record<string, unknown[][]>> = {
  'asr-recommend': {
    languageGroupFor: [['zh-TW'], [' ja-JP '], ['ko'], ['en-US'], ['fr']],
    osKindFor: [['linux'], ['darwin'], ['win32'], ['freebsd']],
    classifyMachine: [[4 * 1024 ** 3, 8], [12 * 1024 ** 3, 4], [32 * 1024 ** 3, 16]],
    gpuKindFromHint: [[nvidia], [intel], [apple], [{ active: true, deviceString: 'AMD Radeon RX 7900', vendorId: 0, vendorString: 'AMD' }]],
    collectGpuDevices: [[{ gpuDevice: [intel, nvidia], gpuDevices: [apple], auxAttributes: { glRenderer: 'ANGLE Renderer', displayName: 'Display', glVendor: 'NVIDIA', vendorString: 'Fallback Vendor' } }], [{ gpuDevices: [apple], auxAttributes: { displayName: 'Apple M4 Max', vendorString: 'Apple' } }]],
    prettyGpuName: [['ANGLE (Apple, Apple M4 Max, Metal Renderer: Apple M4 Max)'], ['Metal Renderer: Radeon Pro 5600M'], ['  NVIDIA RTX 4090  '], ['ANGLE (Intel)']],
    isAppleSilicon: [[{ arch: 'arm64', cpuModel: 'Apple M4 Max', platform: 'darwin' }], [{ arch: 'x64', cpuModel: 'Apple M2', platform: 'darwin' }], [{ arch: 'x64', cpuModel: 'AMD Ryzen', platform: 'linux' }]],
    classifyGpuDevices: [[[intel, nvidia]], [[apple, intel]], [[{ active: true, deviceString: 'unknown GPU', vendorId: 0, vendorString: '' }]]],
    gpuNameFromDevices: [[[intel, nvidia]], [[apple]], [[{ active: true, deviceString: 'unknown GPU', vendorId: 0, vendorString: '' }]]],
    isWeakGpu: [['intel'], ['nvidia'], ['unknown']],
    resolveGpuProfile: [[profile], [{ arch: 'arm64', cpuModel: 'Apple M4 Max', devices: [apple], gpu: 'unknown', gpuName: null, platform: 'darwin' }], [{ arch: 'x64', cpuModel: 'AMD Ryzen', devices: [intel, nvidia], gpu: 'unknown', gpuName: '', platform: 'linux' }]],
    recommendAsrModels: [[{ arch: 'x64', cpuCount: 16, gpu: 'nvidia', language: 'en-US', os: 'linux', ramBytes: 32 * 1024 ** 3 }], [{ arch: 'arm64', cpuCount: 10, gpu: 'apple', language: 'zh-CN', os: 'macos', ramBytes: 16 * 1024 ** 3 }], [{ arch: 'x64', cpuCount: 4, gpu: 'intel', language: 'ja', os: 'windows', ramBytes: 8 * 1024 ** 3 }], [{ arch: 'x64', cpuCount: 2, gpu: 'unknown', language: 'fr', os: 'other', ramBytes: 4 * 1024 ** 3 }]]
  },
  'asr-recognizer': {
    familySupportsAsrLanguage: [['whisper'], ['sense-voice'], ['qwen3'], ['fire-red-asr'], ['parakeet']],
    asrLanguageForFamily: [[], ['whisper'], ['qwen3', 'zh-TW'], ['sense-voice', null]],
    applyAsrStreamLanguage: [[{}, 'whisper', 'en'], [{}, 'qwen3', 'zh-TW']],
    buildOfflineRecognizerConfig: [['whisper', paths, 4, 'zh', 'cpu', 1], ['qwen3', paths, 2, 'en', 'cuda', 0], ['fire-red-asr', paths, 3, 'ja', 'directml', 0], ['sense-voice', paths, 2, 'zh', 'coreml', 1], ['parakeet', paths, 8, undefined, 'cpu', 0]]
  },
  'model-catalog': {
    catalogFor: [[], [{ groups: ['vad', 'speaker', 'asr'], tiers: ['minimal', 'quality'] }], [{ groups: ['punct'], tiers: ['whisper-base'] }], [{ groups: ['asr'], tiers: ['sense-voice', 'sense-voice-2025', 'fire-red-asr', 'parakeet-v2', 'parakeet-v3', 'orukeet', 'qwen3-1.7b'] }]]
  },
  'compute-provider': {
    isSherpaProviderFallbackLog: [['cuda', 'CUDA provider failed: falling back to cpu'], ['coreml', 'CoreML is not available'], ['directml', 'DirectML enabled'], ['cpu', 'falling back to cpu']],
    sherpaProviderCandidates: [[{ arch: 'x64', gpuKinds: ['nvidia', 'intel'], platform: 'linux' }], [{ arch: 'arm64', gpuKinds: ['apple'], platform: 'darwin' }], [{ arch: 'x64', gpuKinds: ['amd'], platform: 'win32' }], [{ arch: 'ia32', gpuKinds: ['unknown'], platform: 'freebsd' }]]
  },
  'download-mirrors': {
    isDownloadMirror: [['auto'], ['cn'], ['global'], ['bad']],
    parseDownloadMirror: [['cn', 'global'], ['bad', 'cn']],
    isGithubDownloadUrl: [['https://github.com/a/b/releases/download/v1/model.onnx'], ['https://api.github.com/repos/a/b'], ['https://raw.githubusercontent.com/a/b/main/model.onnx'], ['https://example.com/model.onnx']],
    githubDownloadUrls: [[spec.url, true], [spec.url, false], ['https://example.com/model.onnx', true]],
    modelScopeFileUrl: [[spec], [{ fileName: 'silero_vad.onnx', url: 'https://example.com/silero_vad.onnx' }], [{ fileName: 'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/tokenizer', url: spec.url }]],
    modelDownloadUrls: [[spec, true], [spec, false], [{ fileName: 'silero_vad.onnx', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx' }, true]]
  },
  'concurrency': {
    clampMaxConcurrentTranscriptions: [[2], ['3'], [0], [8], [2.5]],
    canAdmitTranscription: [[0, 5], [4, 5], [5, 5], [6, 5]]
  },
  'cloud': { parseTranscriptionProvider: [['cloud'], ['local'], ['other']] },
  'errors': {
    transcriptionError: [['http-429', 'rate limited'], ['ffmpeg', 'ffmpeg conversion failed'], ['unknown', 'unrecognized worker failure']],
    isNoAudioStreamError: [['source has no audio stream'], ['Output file does not contain any stream'], ['ordinary ffmpeg failure']],
    classifyTranscriptionFailure: [['ENOSPC: no space left'], ['EACCES: permission denied'], ['ffmpeg: not found'], ['source has no audio stream'], ['ffmpeg conversion failed'], ['source file missing'], ['fetch failed'], ['incomplete model'], ['unknown failure']]
  }
}
