export {
  BACKGROUND_CHILD_PRIORITY,
  backgroundChildSpawnOptions,
  FFMPEG_ENCODE_THREADS,
  lowerChildPriority
} from './child-priority.js'
export { killProcessTree } from './kill-process-tree.js'
export {
  readPidStartTime,
  setReadPidStartTimeImpl,
  isPidAlive
} from './pid-start-time.js'
export type { ReadPidStartTimeFn } from './pid-start-time.js'
