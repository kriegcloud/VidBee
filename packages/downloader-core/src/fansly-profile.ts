import { z } from 'zod'
import { OnlyFansDownloadSchema, OnlyFansProfileSchema } from './onlyfans-profile'

export const FanslyCommandSchema = z.object({
  url: z.string().url(),
  action: z.enum(['get', 'open', 'map', 'stop']),
  category: z.enum(['posts', 'media']).default('media')
})
export const FanslyProfileSchema = OnlyFansProfileSchema
export const FanslyDownloadSchema = OnlyFansDownloadSchema
export type FanslyCommand = z.input<typeof FanslyCommandSchema>
export type FanslyDownload = z.infer<typeof FanslyDownloadSchema>

export function fanslyProfile(value: string): { username: string; profileUrl: string } | null {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    if (
      !(
        ['https:', 'http:'].includes(url.protocol) &&
        ['fansly.com', 'www.fansly.com'].includes(url.hostname)
      ) ||
      url.username ||
      url.password ||
      url.port ||
      parts.length < 1 ||
      parts.length > 2 ||
      (parts.length === 2 && !['posts', 'media'].includes(parts[1]))
    ) {
      return null
    }
    const username = parts[0].toLowerCase()
    if (
      !/^[a-z0-9_]{1,64}$/.test(username) ||
      /^\d+$/.test(username) ||
      [
        'home',
        'login',
        'signup',
        'register',
        'post',
        'messages',
        'notifications',
        'settings',
        'explore',
        'search',
        'subscriptions',
        'collections'
      ].includes(username)
    ) {
      return null
    }
    return { username, profileUrl: `https://fansly.com/${username}` }
  } catch {
    return null
  }
}
export function isFanslySite(value: string): boolean {
  try {
    const host = new URL(value).hostname
    return host === 'fansly.com' || host.endsWith('.fansly.com')
  } catch {
    return false
  }
}
