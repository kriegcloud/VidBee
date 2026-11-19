import { fanslyAdapter } from "@vidbee/browser-capture/fansly-profile";
import { OnlyFansProfiles } from "./onlyfans-profile.js";
export { fanslyAdapter, fanslyItems, fanslyMediaUrl } from "@vidbee/browser-capture/fansly-profile";
export class FanslyProfiles extends OnlyFansProfiles {
  constructor(storageDir: string, defaultDownloadDir: () => string) { super(storageDir, defaultDownloadDir, fanslyAdapter); }
}
