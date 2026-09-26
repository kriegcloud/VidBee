/** One active network operation per platform, shared by maps and downloads. */
export class SourceAdmission {
  private readonly held = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private readonly waiting = new Map<string, (() => void)[]>()

  private key(url: string): string {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    for (const domain of [
      'instagram.com',
      'tiktok.com',
      'facebook.com',
      'vsco.co',
      'threads.net',
      'threads.com',
      'dzen.ru',
      'youtube.com'
    ]) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return domain === 'threads.net' ? 'threads.com' : domain
      }
    }
    return host === 'youtu.be' ? 'youtube.com' : host
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  tryAcquire(url: string): (() => void) | null {
    let key: string
    try {
      key = this.key(url)
    } catch {
      return () => {}
    }
    if (this.held.has(key)) {
      return null
    }
    this.held.add(key)
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      this.held.delete(key)
      this.waiting.get(key)?.shift()?.()
      for (const listener of this.listeners) {
        listener()
      }
    }
  }

  acquire(url: string, signal?: AbortSignal): Promise<(() => void) | null> {
    if (signal?.aborted) {
      return Promise.resolve(null)
    }
    const release = this.tryAcquire(url)
    if (release) {
      return Promise.resolve(release)
    }
    const key = this.key(url)
    return new Promise((resolve) => {
      const waiting = this.waiting.get(key) ?? []
      const grant = () => {
        signal?.removeEventListener('abort', abort)
        resolve(this.tryAcquire(url))
      }
      const abort = () => {
        const index = waiting.indexOf(grant)
        if (index >= 0) {
          waiting.splice(index, 1)
        }
        resolve(null)
      }
      waiting.push(grant)
      this.waiting.set(key, waiting)
      signal?.addEventListener('abort', abort, { once: true })
    })
  }
}
