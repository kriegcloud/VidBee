import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ExecutorFinishEvent, TaskQueueAPI } from '@vidbee/task-queue'
import { GalleryDlExecutor, type GalleryDlExecutorOptions } from './gallery-dl-executor'
import type { SocialMediaOptions, SocialSource } from './social-media'
import { resolveSocialSource, SocialMediaOptionsSchema, socialCollectionUrl } from './social-media'
import { expandTikTokShortLink } from './tiktok-short-link'
import type { DownloadRuntimeSettings } from './types'

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
  request: SocialMediaDownloadRequest
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
  const groupId = `social_${randomUUID()}`
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
          batchTitle: source.owner,
          batchCategory: resolveSocialSource(url)?.category,
          batchOrder: index,
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
  for (const platform of ['x', 'reddit', 'tiktok']) {
    await queue.setMaxPerGroup(`social:${platform}`, 1)
  }
}

/** Inspect at most three media-bearing posts without downloading their assets. */
export const previewSocialMedia = async (
  url: string,
  runtime: Omit<GalleryDlExecutorOptions, 'defaultDownloadDir'>,
  settings?: DownloadRuntimeSettings
) => {
  const source = await inspectSocialMedia(url)
  const directory = await mkdtemp(path.join(tmpdir(), 'vidbee-social-preview-'))
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
    await rm(directory, { recursive: true, force: true })
  }
}
