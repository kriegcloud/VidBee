import { readdir } from 'node:fs/promises'
import path from 'node:path'

// Exact inventory of the pinned Linux CPU runtime. Reject extra files, directories
// and symlinks as well as provider libraries, so alternate library names cannot pass.
const runtimeFiles = [
  'index.js',
  'libonnxruntime.so',
  'libsherpa-onnx-c-api.so',
  'libsherpa-onnx-cxx-api.so',
  'package.json',
  'sherpa-onnx.node'
]

export async function verifyTranscriptionCpuBuild(build) {
  const directory = path.join(
    build,
    'resources/app.asar.unpacked/node_modules/sherpa-onnx-linux-x64'
  )
  const entries = await readdir(directory, { withFileTypes: true })
  const files = entries.map((entry) => entry.name).sort()
  if (
    entries.some((entry) => !entry.isFile()) ||
    JSON.stringify(files) !== JSON.stringify(runtimeFiles)
  ) {
    throw new Error(
      `Transcription CPU build prerequisite failed: expected only ${runtimeFiles.join(', ')}; received ${files.join(', ')}. Execution-provider libraries and unrecognized runtime entries are forbidden.`
    )
  }
  return { runtime: 'sherpa-onnx-linux-x64', files, executionProviders: ['CPUExecutionProvider'] }
}

// CPU-selected and no-recognizer tasks may be silent. Any reported list must
// nevertheless contain CPU only; check every list, including repeated diagnostics.
export function assertTranscriptionCpuProviders(value) {
  if (!value || typeof value !== 'object') {
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'log' && typeof entry === 'string') {
      for (const match of entry.matchAll(/Available providers:([^\r\n]*)/g)) {
        const providers = match[1].match(/\w+ExecutionProvider/g) ?? []
        const list = match[1].replace(/\. Fallback to cpu!.*$/, '').replace(/[,.\s]/g, '')
        if (
          providers.length !== 1 ||
          providers[0] !== 'CPUExecutionProvider' ||
          list !== 'CPUExecutionProvider'
        ) {
          throw new Error(
            `Transcription CPU provider prerequisite failed: Available providers:${match[1]}`
          )
        }
      }
    } else if (entry && typeof entry === 'object') {
      assertTranscriptionCpuProviders(entry)
    }
  }
}
