import * as Context from "effect/Context";
import type { DownloadProcess } from "@vidbee/downloader-core/DownloadProcess.service";
export class CliProbeProcess extends Context.Service<CliProbeProcess, Context.Service.Shape<typeof DownloadProcess>>()(
  "@vidbee/cli/CliProbeProcess.service/CliProbeProcess"
) {}
