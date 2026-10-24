import { useEffect, useState } from 'react'
import { ipcServices } from '../lib/ipc'

interface LocalPosterInput {
  /** The task's own saved file, when one was resolved on disk. */
  filePath?: string | null
  /** A collection's output directory, used when there is no single file. */
  directory?: string | null
}

/**
 * Poster rendered from the media a task saved. gallery-dl routes (OnlyFans,
 * TikTok photos, VSCO, Threads) carry no thumbnail URL, so without this their
 * rows stay blank forever even once the file is on disk.
 *
 * @param input Saved file and/or output directory; both empty disables it.
 */
export const useLocalPoster = (input: LocalPosterInput | null): string | undefined => {
  const [poster, setPoster] = useState<string | undefined>()
  const filePath = input?.filePath ?? null
  const directory = input?.directory ?? null

  useEffect(() => {
    if (!(filePath || directory)) {
      setPoster(undefined)
      return
    }
    let active = true
    void ipcServices.thumbnail
      .getLocalPoster({ directory, filePath })
      .then((url) => {
        if (active) {
          setPoster(url ?? undefined)
        }
      })
      .catch(() => {
        if (active) {
          setPoster(undefined)
        }
      })
    return () => {
      active = false
    }
  }, [directory, filePath])

  return poster
}
