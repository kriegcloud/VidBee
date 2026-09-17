/** @returns {{ fps: number, height: number, method: string, width: number }} */
export const pinHighestQualityInPage = () => {
  const video = document.querySelector('video')
  if (!video) {
    return { fps: 0, height: 0, method: 'none', width: 0 }
  }

  const methods = []
  const score = (item) =>
    (item.height || 0) * 100000 + (item.width || 0) * 10 + (item.bitrate || item.bandwidth || 0)

  const pinHls = (hls) => {
    const levels = hls.levels
    if (!levels || levels.length === 0) {
      return
    }
    if (hls.config) {
      hls.config.capLevelToPlayerSize = false
    }
    hls.autoLevelCapping = -1
    hls.autoLevelEnabled = false
    let bestIndex = 0
    let bestScore = -1
    for (let index = 0; index < levels.length; index += 1) {
      const value = score(levels[index] || {})
      if (value > bestScore) {
        bestScore = value
        bestIndex = index
      }
    }
    hls.currentLevel = bestIndex
    hls.nextLevel = bestIndex
    hls.loadLevel = bestIndex
    methods.push(`hls:${levels[bestIndex]?.height || 0}`)
  }

  const pinShaka = (player) => {
    if (!player.getVariantTracks || !player.selectVariantTrack) {
      return
    }
    if (player.configure) {
      player.configure({ abr: { enabled: false } })
    }
    const tracks = player.getVariantTracks()
    if (!tracks || tracks.length === 0) {
      return
    }
    let best = tracks[0]
    let bestScore = -1
    for (const track of tracks) {
      const value = score(track)
      if (value > bestScore) {
        bestScore = value
        best = track
      }
    }
    player.selectVariantTrack(best, true)
    methods.push(`shaka:${best?.height || 0}`)
  }

  const pinDash = (player) => {
    if (!player.getBitrateInfoListFor || !player.setQualityFor) {
      return
    }
    if (player.updateSettings) {
      player.updateSettings({
        streaming: { abr: { autoSwitchBitrate: { audio: false, video: false } } }
      })
    }
    const list = player.getBitrateInfoListFor('video') || []
    if (list.length === 0) {
      return
    }
    let bestIndex = 0
    let bestScore = -1
    for (let index = 0; index < list.length; index += 1) {
      const value = score(list[index] || {})
      if (value > bestScore) {
        bestScore = value
        bestIndex = index
      }
    }
    player.setQualityFor('video', bestIndex)
    methods.push(`dash:${list[bestIndex]?.height || 0}`)
  }

  const visit = (value, depth) => {
    if (!value || depth > 5 || typeof value !== 'object') {
      return
    }
    if (Array.isArray(value.levels) && 'currentLevel' in value) {
      pinHls(value)
    }
    if (typeof value.getVariantTracks === 'function') {
      pinShaka(value)
    }
    if (typeof value.getBitrateInfoListFor === 'function') {
      pinDash(value)
    }
    if (depth >= 3) {
      return
    }
    for (const key of Object.keys(value)) {
      try {
        visit(value[key], depth + 1)
      } catch {
        /* getter / cross-origin */
      }
    }
  }

  visit(video, 0)
  for (const key of ['hls', 'Hls', 'player', 'dashPlayer', 'shaka', 'videojs']) {
    try {
      visit(window[key], 0)
    } catch {
      /* missing */
    }
  }

  video.controls = false
  video.muted = false
  video.volume = 1
  video.loop = false
  video.style.position = 'fixed'
  video.style.left = '0'
  video.style.top = '0'
  video.style.right = 'auto'
  video.style.bottom = 'auto'
  video.style.margin = '0'
  video.style.maxWidth = 'none'
  video.style.maxHeight = 'none'
  video.style.objectFit = 'fill'
  video.style.zIndex = '2147483647'
  video.style.background = '#000'
  const width = video.videoWidth || 0
  const height = video.videoHeight || 0
  if (width > 0 && height > 0) {
    video.style.width = `${width + (width % 2)}px`
    video.style.height = `${height + (height % 2)}px`
  }
  void video.play()

  let fps = 0
  const quality =
    typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null
  if (quality && video.currentTime > 0) {
    fps = quality.totalVideoFrames / video.currentTime
  }

  return {
    fps: Number.isFinite(fps) ? fps : 0,
    height,
    method: methods.join(',') || 'element',
    width
  }
}

/** Spoof a large player box so ABR does not cap to the kiosk viewport. */
export const spoofLargePlayerBoxInPage = () => {
  const huge = 3840
  const proto = HTMLVideoElement.prototype
  const spoof = (name) => {
    const original = Object.getOwnPropertyDescriptor(proto, name)
    Object.defineProperty(proto, name, {
      configurable: true,
      enumerable: true,
      get() {
        const native = original?.get?.call(this)
        const decoded = name === 'clientWidth' ? this.videoWidth : this.videoHeight
        return Math.max(Number(native) || 0, decoded || 0, huge)
      }
    })
  }
  spoof('clientWidth')
  spoof('clientHeight')
}
