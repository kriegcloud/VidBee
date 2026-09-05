export const ALL_DOWNLOAD_PLATFORM_FILTER = 'all'
export const LOCAL_DOWNLOAD_PLATFORM_KEY = 'local'
export const OTHER_DOWNLOAD_PLATFORM_KEY = 'other'

export interface DownloadPlatform {
  key: string
  label: string
  domain: string | null
}

export interface DownloadPlatformCount extends DownloadPlatform {
  count: number
}

interface KnownPlatform {
  key: string
  label: string
  domain: string
  suffixes: readonly string[]
}

const KNOWN_PLATFORMS: readonly KnownPlatform[] = [
  {
    key: 'youtube',
    label: 'YouTube',
    domain: 'youtube.com',
    suffixes: ['youtube.com', 'youtu.be', 'youtube-nocookie.com']
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    domain: 'tiktok.com',
    suffixes: ['tiktok.com', 'tiktokv.com']
  },
  {
    key: 'bilibili',
    label: 'Bilibili',
    domain: 'bilibili.com',
    suffixes: [
      'bilibili.com',
      'bilibili.tv',
      'b23.tv',
      'bili.tv',
      'bili2233.cn',
      'acg.tv',
      'bilivideo.com'
    ]
  },
  {
    key: 'instagram',
    label: 'Instagram',
    domain: 'instagram.com',
    suffixes: ['instagram.com', 'instagr.am']
  },
  {
    key: 'twitter',
    label: 'X',
    domain: 'x.com',
    suffixes: ['x.com', 'twitter.com', 't.co', 'fxtwitter.com', 'vxtwitter.com', 'fixupx.com']
  },
  {
    key: 'facebook',
    label: 'Facebook',
    domain: 'facebook.com',
    suffixes: ['facebook.com', 'fb.com', 'fb.watch', 'fb.me']
  },
  {
    key: 'reddit',
    label: 'Reddit',
    domain: 'reddit.com',
    suffixes: ['reddit.com', 'redd.it', 'v.redd.it']
  },
  {
    key: 'vimeo',
    label: 'Vimeo',
    domain: 'vimeo.com',
    suffixes: ['vimeo.com']
  },
  {
    key: 'twitch',
    label: 'Twitch',
    domain: 'twitch.tv',
    suffixes: ['twitch.tv', 'twitch.com']
  },
  {
    key: 'dailymotion',
    label: 'Dailymotion',
    domain: 'dailymotion.com',
    suffixes: ['dailymotion.com', 'dai.ly']
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    domain: 'linkedin.com',
    suffixes: ['linkedin.com', 'lnkd.in']
  },
  {
    key: 'pinterest',
    label: 'Pinterest',
    domain: 'pinterest.com',
    suffixes: ['pinterest.com', 'pin.it']
  },
  {
    key: 'tumblr',
    label: 'Tumblr',
    domain: 'tumblr.com',
    suffixes: ['tumblr.com']
  },
  {
    key: 'soundcloud',
    label: 'SoundCloud',
    domain: 'soundcloud.com',
    suffixes: ['soundcloud.com', 'snd.sc', 'sndcdn.com']
  },
  {
    key: 'niconico',
    label: 'Niconico',
    domain: 'nicovideo.jp',
    suffixes: ['nicovideo.jp', 'nico.ms', 'nicochannel.jp']
  },
  {
    key: 'kick',
    label: 'Kick',
    domain: 'kick.com',
    suffixes: ['kick.com']
  },
  {
    key: 'bandcamp',
    label: 'Bandcamp',
    domain: 'bandcamp.com',
    suffixes: ['bandcamp.com']
  },
  {
    key: 'mixcloud',
    label: 'Mixcloud',
    domain: 'mixcloud.com',
    suffixes: ['mixcloud.com']
  },
  {
    key: 'douyin',
    label: 'Douyin',
    domain: 'douyin.com',
    suffixes: ['douyin.com', 'iesdouyin.com']
  },
  {
    key: 'xiaohongshu',
    label: 'Xiaohongshu',
    domain: 'xiaohongshu.com',
    suffixes: ['xiaohongshu.com', 'xhslink.com']
  },
  {
    key: 'wechat',
    label: 'WeChat',
    domain: 'weixin.qq.com',
    suffixes: ['weixin.qq.com', 'wechat.com']
  },
  {
    key: 'kuaishou',
    label: 'Kuaishou',
    domain: 'kuaishou.com',
    suffixes: ['kuaishou.com', 'gifshow.com', 'chenzhongtech.com']
  },
  {
    key: 'weibo',
    label: 'Weibo',
    domain: 'weibo.com',
    suffixes: ['weibo.com', 'weibo.cn', 't.cn']
  },
  {
    key: 'xiaoyuzhou',
    label: 'Xiaoyuzhou',
    domain: 'xiaoyuzhoufm.com',
    suffixes: ['xiaoyuzhoufm.com', 'xiaoyuzhou.com', 'xyzcdn.net']
  },
  {
    key: 'ximalaya',
    label: 'Ximalaya',
    domain: 'ximalaya.com',
    suffixes: ['ximalaya.com', 'himalaya.com']
  },
  {
    key: 'youku',
    label: 'Youku',
    domain: 'youku.com',
    suffixes: ['youku.com', 'tudou.com']
  },
  {
    key: 'iqiyi',
    label: 'iQiyi',
    domain: 'iqiyi.com',
    suffixes: ['iqiyi.com', 'iq.com']
  },
  {
    key: 'tencentvideo',
    label: 'Tencent Video',
    domain: 'v.qq.com',
    suffixes: ['v.qq.com']
  },
  {
    key: 'acfun',
    label: 'AcFun',
    domain: 'acfun.cn',
    suffixes: ['acfun.cn']
  },
  {
    key: 'netease',
    label: 'NetEase Cloud',
    domain: 'music.163.com',
    suffixes: ['music.163.com']
  },
  {
    key: 'huya',
    label: 'Huya',
    domain: 'huya.com',
    suffixes: ['huya.com']
  },
  {
    key: 'douyu',
    label: 'Douyu',
    domain: 'douyu.com',
    suffixes: ['douyu.com']
  },
  {
    key: 'mgtv',
    label: 'Mango TV',
    domain: 'mgtv.com',
    suffixes: ['mgtv.com']
  },
  {
    key: 'xigua',
    label: 'Xigua',
    domain: 'ixigua.com',
    suffixes: ['ixigua.com']
  },
  {
    key: 'zhihu',
    label: 'Zhihu',
    domain: 'zhihu.com',
    suffixes: ['zhihu.com']
  },
  {
    key: 'kugou',
    label: 'Kugou',
    domain: 'kugou.com',
    suffixes: ['kugou.com']
  },
  {
    key: 'kuwo',
    label: 'Kuwo',
    domain: 'kuwo.cn',
    suffixes: ['kuwo.cn']
  },
  {
    key: 'qqmusic',
    label: 'QQ Music',
    domain: 'y.qq.com',
    suffixes: ['y.qq.com']
  },
  {
    key: 'lizhi',
    label: 'Lizhi',
    domain: 'lizhi.fm',
    suffixes: ['lizhi.fm']
  },
  {
    key: 'qingting',
    label: 'Qingting',
    domain: 'qingting.fm',
    suffixes: ['qingting.fm']
  },
  {
    key: 'spotify',
    label: 'Spotify',
    domain: 'spotify.com',
    suffixes: ['spotify.com', 'spotify.link', 'anchor.fm']
  },
  {
    key: 'applepodcasts',
    label: 'Apple Podcasts',
    domain: 'podcasts.apple.com',
    suffixes: ['podcasts.apple.com', 'itunes.apple.com']
  },
  {
    key: 'snapchat',
    label: 'Snapchat',
    domain: 'snapchat.com',
    suffixes: ['snapchat.com']
  },
  {
    key: 'threads',
    label: 'Threads',
    domain: 'threads.net',
    suffixes: ['threads.net', 'threads.com']
  },
  {
    key: 'bluesky',
    label: 'Bluesky',
    domain: 'bsky.app',
    suffixes: ['bsky.app', 'bsky.social']
  },
  {
    key: 'rumble',
    label: 'Rumble',
    domain: 'rumble.com',
    suffixes: ['rumble.com']
  },
  {
    key: 'odysee',
    label: 'Odysee',
    domain: 'odysee.com',
    suffixes: ['odysee.com']
  },
  {
    key: 'vk',
    label: 'VK',
    domain: 'vk.com',
    suffixes: ['vk.com', 'vk.ru', 'vk.me']
  },
  {
    key: 'okru',
    label: 'OK.ru',
    domain: 'ok.ru',
    suffixes: ['ok.ru']
  },
  {
    key: 'ted',
    label: 'TED',
    domain: 'ted.com',
    suffixes: ['ted.com']
  },
  {
    key: 'steam',
    label: 'Steam',
    domain: 'steampowered.com',
    suffixes: ['steampowered.com', 'steamcommunity.com']
  },
  {
    key: 'archive',
    label: 'Internet Archive',
    domain: 'archive.org',
    suffixes: ['archive.org']
  },
  {
    key: 'naver',
    label: 'Naver',
    domain: 'naver.com',
    suffixes: ['naver.com']
  },
  {
    key: 'telegram',
    label: 'Telegram',
    domain: 't.me',
    suffixes: ['t.me', 'telegram.me', 'telegram.org']
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    domain: 'whatsapp.com',
    suffixes: ['whatsapp.com', 'wa.me']
  },
  {
    key: 'discord',
    label: 'Discord',
    domain: 'discord.com',
    suffixes: ['discord.com', 'discordapp.com', 'discord.gg']
  },
  {
    key: 'cctv',
    label: 'CCTV',
    domain: 'cctv.com',
    suffixes: ['cctv.com', 'cctv.cn', 'cntv.cn']
  },
  {
    key: 'sohu',
    label: 'Sohu',
    domain: 'sohu.com',
    suffixes: ['sohu.com']
  },
  {
    key: 'toutiao',
    label: 'Toutiao',
    domain: 'toutiao.com',
    suffixes: ['toutiao.com']
  },
  {
    key: 'haokan',
    label: 'Haokan',
    domain: 'haokan.baidu.com',
    suffixes: ['haokan.baidu.com']
  },
  {
    key: 'pearvideo',
    label: 'Pear Video',
    domain: 'pearvideo.com',
    suffixes: ['pearvideo.com']
  },
  {
    key: 'huajiao',
    label: 'Huajiao',
    domain: 'huajiao.com',
    suffixes: ['huajiao.com']
  },
  {
    key: 'meipai',
    label: 'Meipai',
    domain: 'meipai.com',
    suffixes: ['meipai.com']
  },
  {
    key: 'missevan',
    label: 'MissEvan',
    domain: 'missevan.com',
    suffixes: ['missevan.com']
  },
  {
    key: 'xinpianchang',
    label: 'Xinpianchang',
    domain: 'xinpianchang.com',
    suffixes: ['xinpianchang.com']
  },
  {
    key: 'wetv',
    label: 'WeTV',
    domain: 'wetv.vip',
    suffixes: ['wetv.vip']
  },
  {
    key: 'viu',
    label: 'Viu',
    domain: 'viu.com',
    suffixes: ['viu.com']
  },
  {
    key: 'weishi',
    label: 'Weishi',
    domain: 'weishi.qq.com',
    suffixes: ['weishi.qq.com']
  },
  {
    key: 'pipix',
    label: 'Pipix',
    domain: 'pipix.com',
    suffixes: ['pipix.com']
  },
  {
    key: 'letv',
    label: 'Le.com',
    domain: 'le.com',
    suffixes: ['le.com', 'letv.com']
  },
  {
    key: 'castbox',
    label: 'Castbox',
    domain: 'castbox.fm',
    suffixes: ['castbox.fm']
  },
  {
    key: 'pocketcasts',
    label: 'Pocket Casts',
    domain: 'pocketcasts.com',
    suffixes: ['pocketcasts.com', 'pca.st']
  },
  {
    key: 'overcast',
    label: 'Overcast',
    domain: 'overcast.fm',
    suffixes: ['overcast.fm']
  },
  {
    key: 'buzzsprout',
    label: 'Buzzsprout',
    domain: 'buzzsprout.com',
    suffixes: ['buzzsprout.com']
  },
  {
    key: 'libsyn',
    label: 'Libsyn',
    domain: 'libsyn.com',
    suffixes: ['libsyn.com']
  },
  {
    key: 'spreaker',
    label: 'Spreaker',
    domain: 'spreaker.com',
    suffixes: ['spreaker.com']
  },
  {
    key: 'acast',
    label: 'Acast',
    domain: 'acast.com',
    suffixes: ['acast.com']
  },
  {
    key: 'podbean',
    label: 'Podbean',
    domain: 'podbean.com',
    suffixes: ['podbean.com']
  },
  {
    key: 'iheart',
    label: 'iHeart',
    domain: 'iheart.com',
    suffixes: ['iheart.com']
  },
  {
    key: 'tunein',
    label: 'TuneIn',
    domain: 'tunein.com',
    suffixes: ['tunein.com']
  },
  {
    key: 'megaphone',
    label: 'Megaphone',
    domain: 'megaphone.fm',
    suffixes: ['megaphone.fm']
  },
  {
    key: 'simplecast',
    label: 'Simplecast',
    domain: 'simplecast.com',
    suffixes: ['simplecast.com']
  },
  {
    key: 'googledrive',
    label: 'Google Drive',
    domain: 'drive.google.com',
    suffixes: ['drive.google.com', 'docs.google.com']
  },
  {
    key: 'dropbox',
    label: 'Dropbox',
    domain: 'dropbox.com',
    suffixes: ['dropbox.com', 'dropboxusercontent.com']
  },
  {
    key: 'onedrive',
    label: 'OneDrive',
    domain: 'onedrive.live.com',
    suffixes: ['onedrive.live.com', '1drv.ms']
  },
  {
    key: 'loom',
    label: 'Loom',
    domain: 'loom.com',
    suffixes: ['loom.com']
  },
  {
    key: 'streamable',
    label: 'Streamable',
    domain: 'streamable.com',
    suffixes: ['streamable.com']
  },
  {
    key: 'bbc',
    label: 'BBC',
    domain: 'bbc.co.uk',
    suffixes: ['bbc.co.uk', 'bbc.com']
  },
  {
    key: 'cnn',
    label: 'CNN',
    domain: 'cnn.com',
    suffixes: ['cnn.com']
  },
  {
    key: 'espn',
    label: 'ESPN',
    domain: 'espn.com',
    suffixes: ['espn.com']
  },
  {
    key: 'applemusic',
    label: 'Apple Music',
    domain: 'music.apple.com',
    suffixes: ['music.apple.com']
  },
  {
    key: 'appletv',
    label: 'Apple TV',
    domain: 'tv.apple.com',
    suffixes: ['tv.apple.com']
  },
  {
    key: 'crunchyroll',
    label: 'Crunchyroll',
    domain: 'crunchyroll.com',
    suffixes: ['crunchyroll.com']
  },
  {
    key: 'patreon',
    label: 'Patreon',
    domain: 'patreon.com',
    suffixes: ['patreon.com']
  },
  {
    key: 'substack',
    label: 'Substack',
    domain: 'substack.com',
    suffixes: ['substack.com']
  },
  {
    key: 'abema',
    label: 'Abema',
    domain: 'abema.tv',
    suffixes: ['abema.tv']
  },
  {
    key: 'tver',
    label: 'TVer',
    domain: 'tver.jp',
    suffixes: ['tver.jp']
  },
  {
    key: 'fc2',
    label: 'FC2',
    domain: 'fc2.com',
    suffixes: ['fc2.com']
  },
  {
    key: 'pixiv',
    label: 'Pixiv',
    domain: 'pixiv.net',
    suffixes: ['pixiv.net', 'fanbox.cc']
  },
  {
    key: 'ninegag',
    label: '9GAG',
    domain: '9gag.com',
    suffixes: ['9gag.com']
  },
  {
    key: 'imgur',
    label: 'Imgur',
    domain: 'imgur.com',
    suffixes: ['imgur.com']
  },
  {
    key: 'audiomack',
    label: 'Audiomack',
    domain: 'audiomack.com',
    suffixes: ['audiomack.com']
  },
  {
    key: 'audius',
    label: 'Audius',
    domain: 'audius.co',
    suffixes: ['audius.co']
  },
  {
    key: 'bitchute',
    label: 'BitChute',
    domain: 'bitchute.com',
    suffixes: ['bitchute.com']
  }
]

const LOCAL_PLATFORM: DownloadPlatform = {
  key: LOCAL_DOWNLOAD_PLATFORM_KEY,
  label: 'Local',
  domain: null
}

const OTHER_PLATFORM: DownloadPlatform = {
  key: OTHER_DOWNLOAD_PLATFORM_KEY,
  label: 'Other',
  domain: null
}

/**
 * True when `host` is the suffix or a subdomain of it.
 */
const hostMatchesSuffix = (host: string, suffix: string): boolean => {
  return host === suffix || host.endsWith(`.${suffix}`)
}

/**
 * Strip a leading `www.` so unknown hosts group under one tab.
 */
const stripWww = (host: string): string => {
  return host.startsWith('www.') ? host.slice(4) : host
}

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'edu.cn',
  'com.hk',
  'com.tw',
  'com.au',
  'com.br',
  'com.sg',
  'co.uk',
  'org.uk',
  'ac.uk',
  'co.jp',
  'ne.jp',
  'or.jp',
  'co.kr',
  'co.nz',
  'co.in',
  'co.id',
  'co.za'
])

const GENERIC_BRAND_SUFFIXES = ['fm', 'tv', 'app'] as const

/**
 * Registrable brand from a hostname (`m.xiaoyuzhoufm.com` → `xiaoyuzhoufm`).
 */
const brandFromHost = (host: string): string => {
  const labels = host.split('.').filter(Boolean)
  if (labels.length === 0) {
    return host
  }
  if (labels.length === 1) {
    return labels[0] ?? host
  }

  const lastTwo = labels.slice(-2).join('.')
  if (MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo)) {
    return labels.at(-3) ?? labels[0] ?? host
  }
  return labels.at(-2) ?? host
}

/**
 * Drop trailing `fm`/`tv`/`app` when a real brand name remains (`xiaoyuzhoufm` → `xiaoyuzhou`).
 */
const stripGenericBrandSuffix = (brand: string): string => {
  for (const suffix of GENERIC_BRAND_SUFFIXES) {
    if (brand.length > suffix.length + 2 && brand.endsWith(suffix)) {
      return brand.slice(0, -suffix.length)
    }
  }
  return brand
}

/**
 * Title-case a brand token (`xiaoyuzhou` → `Xiaoyuzhou`, `bbc` → `BBC`).
 */
const titleCaseBrand = (brand: string): string => {
  const cleaned = stripGenericBrandSuffix(brand)
  if (!cleaned) {
    return brand
  }
  if (cleaned.length <= 4 && /^[a-z]+$/.test(cleaned)) {
    return cleaned.toUpperCase()
  }
  return cleaned
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Human title for an unknown site (`xiaoyuzhoufm.com` → `Xiaoyuzhou`).
 */
const hostLabel = (host: string): string => {
  const trimmed = stripWww(host)
  if (!trimmed) {
    return OTHER_PLATFORM.label
  }
  return titleCaseBrand(brandFromHost(trimmed))
}

const AMBIGUOUS_BRANDS = new Set([
  'archive',
  'google',
  'apple',
  'amazon',
  'microsoft',
  'github',
  'cloud',
  'media',
  'video',
  'live',
  'news',
  'music',
  'radio',
  'podcast',
  'share',
  'play',
  'blog',
  'shop',
  'store',
  'game',
  'games'
])

/**
 * True when `suffix` is a registrable domain like `example.com` or `example.co.uk`.
 */
const isRegistrableSuffix = (suffix: string): boolean => {
  const labels = suffix.split('.').filter(Boolean)
  if (labels.length === 2) {
    return true
  }
  return labels.length === 3 && MULTI_PART_PUBLIC_SUFFIXES.has(labels.slice(-2).join('.'))
}

/**
 * Unique brand token for a known suffix, or null when matching by brand would be unsafe.
 */
const uniqueBrandFromSuffix = (suffix: string): string | null => {
  if (!isRegistrableSuffix(suffix)) {
    return null
  }
  const brand = stripGenericBrandSuffix(brandFromHost(suffix))
  if (brand.length < 5 || /^\d+$/.test(brand) || AMBIGUOUS_BRANDS.has(brand)) {
    return null
  }
  return brand
}

/**
 * Map unique brands to platforms so `pinterest.co.uk` still resolves as Pinterest.
 */
const KNOWN_BRANDS = new Map<string, KnownPlatform>()
for (const platform of KNOWN_PLATFORMS) {
  const domainBrand = uniqueBrandFromSuffix(platform.domain)
  if (domainBrand && !KNOWN_BRANDS.has(domainBrand)) {
    KNOWN_BRANDS.set(domainBrand, platform)
  }
  for (const suffix of platform.suffixes) {
    const suffixBrand = uniqueBrandFromSuffix(suffix)
    if (!suffixBrand || KNOWN_BRANDS.has(suffixBrand)) {
      continue
    }
    if (domainBrand && suffixBrand !== domainBrand) {
      continue
    }
    KNOWN_BRANDS.set(suffixBrand, platform)
  }
}

/**
 * Convert a known platform entry into the public filter shape.
 */
const toDownloadPlatform = (platform: KnownPlatform): DownloadPlatform => {
  return {
    key: platform.key,
    label: platform.label,
    domain: platform.domain
  }
}

/**
 * Match a hostname to a known platform by suffix, then by unique brand.
 */
const matchKnownPlatform = (host: string): DownloadPlatform | null => {
  for (const platform of KNOWN_PLATFORMS) {
    for (const suffix of platform.suffixes) {
      if (hostMatchesSuffix(host, suffix)) {
        return toDownloadPlatform(platform)
      }
    }
  }
  const brand = stripGenericBrandSuffix(brandFromHost(host))
  const platform = KNOWN_BRANDS.get(brand)
  return platform ? toDownloadPlatform(platform) : null
}

/**
 * Resolve a download URL into a platform used by the home filter tabs.
 */
export const resolveDownloadPlatform = (url: string): DownloadPlatform => {
  const value = url.trim()
  if (!value) {
    return OTHER_PLATFORM
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'file:') {
      return LOCAL_PLATFORM
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return OTHER_PLATFORM
    }

    const host = parsed.hostname.trim().toLowerCase()
    if (!host) {
      return OTHER_PLATFORM
    }

    const known = matchKnownPlatform(host)
    if (known) {
      return known
    }

    const normalizedHost = stripWww(host)
    return {
      key: normalizedHost,
      label: hostLabel(normalizedHost),
      domain: normalizedHost
    }
  } catch {
    return OTHER_PLATFORM
  }
}

/**
 * Count downloads per platform, sorted by count then label.
 */
export const listDownloadPlatformCounts = (urls: readonly string[]): DownloadPlatformCount[] => {
  const counts = new Map<string, DownloadPlatformCount>()
  for (const url of urls) {
    const platform = resolveDownloadPlatform(url)
    const existing = counts.get(platform.key)
    if (existing) {
      existing.count += 1
      continue
    }
    counts.set(platform.key, { ...platform, count: 1 })
  }

  return Array.from(counts.values()).sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count
    }
    return left.label.localeCompare(right.label)
  })
}

/**
 * True when a download belongs to the selected platform filter.
 */
export const matchesDownloadPlatformFilter = (url: string, filter: string): boolean => {
  if (filter === ALL_DOWNLOAD_PLATFORM_FILTER) {
    return true
  }
  return resolveDownloadPlatform(url).key === filter
}

/**
 * Localized label for a platform tab. Brand names stay as resolved.
 */
export const downloadPlatformDisplayLabel = (
  platform: Pick<DownloadPlatform, 'key' | 'label'>,
  labels: { local: string; other: string }
): string => {
  if (platform.key === LOCAL_DOWNLOAD_PLATFORM_KEY) {
    return labels.local
  }
  if (platform.key === OTHER_DOWNLOAD_PLATFORM_KEY) {
    return labels.other
  }
  return platform.label
}
