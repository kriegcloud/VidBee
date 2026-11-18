import { z } from "zod";
import { OnlyFansDownloadSchema } from "./onlyfans-profile";
export { fanslyProfile, isFanslySite } from "@vidbee/downloader-core/fansly-profile";
export const FanslyCommandSchema = z.object({
  url: z.string().url(),
  action: z.enum(['get', 'open', 'map', 'stop']),
  category: z.enum(['posts', 'media']).default('media')
})



export type FanslyCommand = z.input<typeof FanslyCommandSchema>

export type FanslyDownload = z.infer<typeof OnlyFansDownloadSchema>
