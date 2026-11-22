import * as Native from '../../shared/live-log'
import {
  type AppendCappedLogInput as ReexportAppendCappedLogInput,
  type DownloadLogIpcPayload as ReexportDownloadLogIpcPayload,
  LIVE_LOG_CHAR_CAP as ReexportLIVE_LOG_CHAR_CAP
} from '../../shared/live-log'

export {
  type ReexportAppendCappedLogInput as AppendCappedLogInput,
  type ReexportDownloadLogIpcPayload as DownloadLogIpcPayload,
  ReexportLIVE_LOG_CHAR_CAP as LIVE_LOG_CHAR_CAP
}
export function appendCappedLog(
  current: string,
  chunk: string,
  cap: number = Native.LIVE_LOG_CHAR_CAP
): string {
  return Native.appendCappedLog({
    current,
    chunk,
    cap
  })
}
