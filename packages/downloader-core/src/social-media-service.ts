import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ExecutorFinishEvent, TaskQueueAPI } from '@vidbee/task-queue'
import type { SourceAdmission } from '@vidbee/task-queue/source-admission'
import { z } from 'zod'
import { GalleryDlExecutor, type GalleryDlExecutorOptions } from './gallery-dl-executor'
import type { SocialMediaOptions, SocialSource } from './social-media'
import { resolveSocialSource, SocialMediaOptionsSchema, socialCollectionUrl } from './social-media'
import { expandTikTokShortLink } from './tiktok-short-link'
import type { DownloadRuntimeSettings } from './types'

export interface SocialMappedItem {
  id: string
  url: string
  author: string
  title?: string
  images: number
  videos: number
  downloaded?: boolean
}

export interface SocialProfileCategory {
  state: 'unscanned' | 'mapping' | 'partial' | 'complete' | 'auth-required' | 'error'
  items: SocialMappedItem[]
  error?: string
}

export interface SocialMappedProfile {
  profileUrl: string
  platform: 'x' | 'tiktok' | 'redgifs'
  owner: string
  categories: Record<string, SocialProfileCategory>
  updatedAt: number
}

export const SocialMappedItemSchema = z.object({
  id: z.string(),
  url: z.url(),
  author: z.string(),
  title: z.string().optional(),
  images: z.number().int().nonnegative(),
  videos: z.number().int().nonnegative(),
  downloaded: z.boolean().optional()
})

export const SocialProfileCategorySchema = z.object({
  state: z.enum(['unscanned', 'mapping', 'partial', 'complete', 'auth-required', 'error']),
  items: z.array(SocialMappedItemSchema),
  error: z.string().optional()
})

export const SocialMappedProfileSchema = z.object({
  profileUrl: z.url(),
  platform: z.enum(['x', 'tiktok', 'redgifs']),
  owner: z.string(),
  categories: z.record(z.string(), SocialProfileCategorySchema),
  updatedAt: z.number()
})

/** Map post references only; signed media URLs never enter the saved profile. */
export const mapSocialMediaProfile = async (
  url: string,
  runtime: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & { admission?: SourceAdmission },
  settings: DownloadRuntimeSettings | undefined,
  signal: AbortSignal,
  onItem: (item: SocialMappedItem) => void
): Promise<{ complete: boolean; error?: string }> => {
  const source = await inspectSocialMedia(url)
  if (!(['x', 'tiktok'].includes(source.platform) && ['profile', 'feed'].includes(source.kind))) {
    throw new Error('Map an X or TikTok profile category URL.')
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'vidbee-social-map-'))
  let release: (() => void) | null | undefined
  let discoveredItems = 0
  try {
    release = await runtime.admission?.acquire(url, signal)
    if (signal.aborted) {
      return { complete: false }
    }
    const executor = new GalleryDlExecutor({ ...runtime, defaultDownloadDir: directory })
    const result = await new Promise<ExecutorFinishEvent>((resolve) => {
      const run = executor.run(
        {
          taskId: randomUUID(),
          attemptId: randomUUID(),
          attemptNumber: 1,
          input: {
            kind: 'social-media',
            url: source.url,
            options: {
              settings,
              customDownloadPath: directory,
              socialInspect: true,
              socialMap: true,
              socialMedia: { linkedMedia: false }
            }
          }
        },
        {
          onSpawn() {},
          onProgress() {},
          onStd: (event) => {
            if (!event.line.startsWith('__VIDBEE_SOCIAL__\t')) {
              return
            }
            try {
              const value: unknown = JSON.parse(event.line.slice('__VIDBEE_SOCIAL__\t'.length))
              if (
                !value ||
                typeof value !== 'object' ||
                !('type' in value) ||
                value.type !== 'item'
              ) {
                return
              }
              const raw = 'item' in value ? value.item : null
              if (!raw || typeof raw !== 'object') {
                return
              }
              const entry = raw as Record<string, unknown>
              if (
                typeof entry.id !== 'string' ||
                !/^\d+$/.test(entry.id) ||
                typeof entry.url !== 'string' ||
                typeof entry.author !== 'string' ||
                !['image', 'video'].includes(String(entry.kind))
              ) {
                return
              }
              const post = resolveSocialSource(entry.url)
              if (post?.kind !== 'post' || post.platform !== source.platform) {
                return
              }
              discoveredItems += 1
              onItem({
                id: entry.id,
                url: post.url,
                author: entry.author,
                images: entry.kind === 'image' ? 1 : 0,
                videos: entry.kind === 'video' ? 1 : 0
              })
            } catch {
              // Malformed item events cannot become persisted references.
            }
          },
          onFinish: resolve
        }
      )
      signal.addEventListener('abort', () => void run.cancel(0), { once: true })
    })
    if (signal.aborted || result.result.type === 'cancelled') {
      return { complete: false }
    }
    if (result.result.type === 'success') {
      if (source.platform === 'x' && discoveredItems === 0) {
        return {
          complete: false,
          error: 'X returned no downloadable posts. Check the dedicated browser session and retry mapping.'
        }
      }
      return { complete: true }
    }
    const diagnostic = `${result.result.error.rawMessage}\n${result.stderrTail}`
    return {
      complete: false,
      error: /AuthRequired|Could not authenticate you|login required|authenticated cookies|Extracted 0 cookies/i.test(diagnostic)
        ? source.platform === 'x'
          ? 'AuthRequired: X rejected the dedicated browser cookies. Reopen the browser, sign in again if prompted, close it, then retry mapping.'
          : 'AuthRequired: sign in with the dedicated browser and retry mapping.'
        : 'Profile mapping stopped before traversal completed. Saved items were retained.'
    }
  } finally {
    release?.()
    await rm(directory, { recursive: true, force: true })
  }
}

export interface SocialMediaDownloadRequest {
  url: string
  categories?: string[]
  options?: Partial<SocialMediaOptions>
  customDownloadPath?: string
  settings?: DownloadRuntimeSettings
}

export const inspectSocialMedia = async (url: string): Promise<SocialSource> => {
  const source = resolveSocialSource(await expandTikTokShortLink(url))
  if (!source || source.kind === 'unsupported') {
    throw new Error(
      'This social media URL is not supported. Use a post, profile, or supported collection URL.'
    )
  }
  return source
}

/** Queue each explicitly selected category through the same host-neutral executor. */
export const downloadSocialMedia = async (
  queue: TaskQueueAPI,
  request: SocialMediaDownloadRequest,
  batch?: { id: string; title: string; order: number }
): Promise<{ groupId: string; ids: string[] }> => {
  const source = await inspectSocialMedia(request.url)
  const options = SocialMediaOptionsSchema.parse(request.options ?? {})
  const categories = [...new Set(request.categories ?? [])]
  const urls = categories.length
    ? categories.map((key) => {
        const category = source.categories.find((item) => item.key === key)
        if (!category) {
          throw new Error(`Unsupported collection category: ${key}`)
        }
        return category.url
      })
    : [socialCollectionUrl(source)]
  const groupId = batch?.id ?? `social_${randomUUID()}`
  const groupKey = `social:${source.platform}`
  await queue.setMaxPerGroup(groupKey, 1)
  const ids: string[] = []
  for (const [index, url] of urls.entries()) {
    const result = await queue.add({
      groupKey,
      input: {
        kind: 'social-media',
        url,
        title: `${source.platform}: ${source.owner}`,
        options: {
          socialMedia: options,
          settings: request.settings,
          customDownloadPath: request.customDownloadPath,
          downloadPath: request.customDownloadPath?.trim() || request.settings?.downloadPath,
          batchId: groupId,
          batchKind: 'social-media',
          batchTitle: batch?.title ?? source.owner,
          batchCategory: resolveSocialSource(url)?.category,
          batchOrder: (batch?.order ?? 0) + index,
          sourceMediaKind:
            options.media === 'images' ? 'image' : options.media === 'videos' ? 'video' : 'mixed'
        }
      }
    })
    ids.push(result.id)
  }
  return { groupId, ids }
}

export const restoreSocialMediaGroupCaps = async (queue: TaskQueueAPI): Promise<void> => {
  for (const platform of ['x', 'reddit', 'tiktok', 'instagram']) {
    await queue.setMaxPerGroup(`social:${platform}`, 1)
  }
}

/** Inspect at most three media-bearing posts without downloading their assets. */
export const previewSocialMedia = async (
  url: string,
  runtime: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'> & { admission?: SourceAdmission },
  settings?: DownloadRuntimeSettings
) => {
  const source = await inspectSocialMedia(url)
  const directory = await mkdtemp(path.join(tmpdir(), 'vidbee-social-preview-'))
  const release = await runtime.admission?.acquire(url)
  try {
    const executor = new GalleryDlExecutor({ ...runtime, defaultDownloadDir: directory })
    const result = await new Promise<ExecutorFinishEvent>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let finished = false
      const run = executor.run(
        {
          taskId: randomUUID(),
          attemptId: randomUUID(),
          attemptNumber: 1,
          input: {
            kind: 'social-media',
            url: source.url,
            options: {
              settings,
              customDownloadPath: directory,
              socialInspect: true,
              socialMedia: { maxPosts: 3, linkedMedia: false }
            }
          }
        },
        {
          onSpawn() {},
          onProgress() {},
          onStd() {},
          onFinish: (event) => {
            finished = true
            clearTimeout(timer)
            resolve(event)
          }
        }
      )
      if (finished) {
        return
      }
      timer = setTimeout(() => {
        void run.cancel(0)
      }, 30_000)
      timer.unref()
    })
    if (result.result.type !== 'success' || !result.result.output.collectionSummary) {
      throw new Error(
        'Preview unavailable. Check access and cookies, or start the download to see detailed errors.'
      )
    }
    const summary = result.result.output.collectionSummary
    return {
      source,
      preview: {
        posts: summary.posts,
        images: summary.images,
        videos: summary.videos,
        limited: summary.reason === 'limit'
      }
    }
  } finally {
    release?.()
    await rm(directory, { recursive: true, force: true })
  }
}
