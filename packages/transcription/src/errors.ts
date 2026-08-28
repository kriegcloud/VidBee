import { virtualError, type ClassifiedError, type ErrorCategory } from '@vidbee/task-queue'

export function transcriptionError(
  category: ErrorCategory,
  message: string
): ClassifiedError {
  return virtualError(category, message)
}

export function classifyTranscriptionFailure(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  if (/enospc|no space left/i.test(message)) {
    return transcriptionError('disk-full', message)
  }
  if (/eacces|eperm|permission denied/i.test(message)) {
    return transcriptionError('permission-denied', message)
  }
  if (/ffmpeg|ffprobe/i.test(message) && /not found|enoent/i.test(lower)) {
    return transcriptionError('binary-missing', message)
  }
  if (/ffmpeg|conversion failed/i.test(message)) {
    return transcriptionError('ffmpeg', message)
  }
  if (/enoent|no such file|source file missing|file not found/i.test(lower)) {
    return transcriptionError('not-found', message)
  }
  if (/econnreset|etimedout|enotfound|socket hang up|http error 5|network/i.test(lower)) {
    return transcriptionError('network-transient', message)
  }
  if (/sherpa-onnx|model missing|model not ready|native addon/i.test(lower)) {
    return transcriptionError('binary-missing', message)
  }
  return transcriptionError('unknown', message)
}
