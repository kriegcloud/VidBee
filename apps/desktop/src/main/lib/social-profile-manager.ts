import path from 'node:path'
import { SocialProfileManager } from '@vidbee/downloader-core/social-profile-manager'
import { app } from 'electron'
import { galleryDlManager } from './gallery-dl-manager'
import { sourceAdmission } from './task-queue-host'

let manager: SocialProfileManager | null = null

export const getSocialProfileManager = (): SocialProfileManager => {
  manager ??= new SocialProfileManager({
    storageDir: path.join(app.getPath('userData'), 'social-profiles'),
    runtime: {
      admission: sourceAdmission,
      resolveBinaryPath: () => galleryDlManager.getPath(),
      resolveExtraArgs: (settings, url) => galleryDlManager.getRuntimeArgs(settings, url)
    }
  })
  return manager
}
