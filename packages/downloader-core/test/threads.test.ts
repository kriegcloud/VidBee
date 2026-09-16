import { isOutputComplete, TaskKindSchema, TRANSCRIBABLE_TASK_KINDS } from '@vidbee/task-queue'
import { describe, expect, it } from 'vitest'
import {
  resolveDownloadTaskKind,
  resolveGalleryDlFilenameTemplate,
  shouldUseGalleryDl
} from '../src/gallery-dl-executor'
import { normalizeThreadsUrl } from '../src/threads'

describe('Threads routing', () => {
  it.each(['threads-post', 'threads-profile'] as const)(
    'requires complete gallery output for %s',
    (kind) => {
      const output = {
        filePath: '/gallery/photo.jpg',
        outputDirectory: '/gallery',
        size: 10,
        fileCount: 1,
        failedCount: 0
      }
      const check = { filePresent: () => true }
      expect(isOutputComplete(kind, output, check)).toBe(true)
      expect(isOutputComplete(kind, { ...output, failedCount: 1 }, check)).toBe(false)
      expect(isOutputComplete(kind, { ...output, fileCount: 0 }, check)).toBe(false)
      expect(isOutputComplete(kind, { ...output, outputDirectory: undefined }, check)).toBe(false)
    }
  )

  it.each([
    ['https://threads.net/@BenOppold?x=1', 'profile', 'https://www.threads.com/@benoppold/media'],
    [
      'https://www.threads.com/@benoppold/media/',
      'profile',
      'https://www.threads.com/@benoppold/media'
    ],
    [
      'http://threads.net/@benoppold/post/DZ7eGA1G7wU/?x=1',
      'post',
      'https://www.threads.com/@benoppold/post/DZ7eGA1G7wU'
    ]
  ])('routes %s as a gallery', (url, kind, canonical) => {
    expect(normalizeThreadsUrl(url)).toMatchObject({ kind, url: canonical, username: 'benoppold' })
    expect(shouldUseGalleryDl(url)).toBe(true)
    const taskKind = TaskKindSchema.parse(`threads-${kind}`)
    expect(resolveDownloadTaskKind(url, 'video')).toBe(taskKind)
    expect(resolveDownloadTaskKind(url, 'audio')).toBe(taskKind)
    expect(TRANSCRIBABLE_TASK_KINDS.has(taskKind)).toBe(false)
    expect(resolveGalleryDlFilenameTemplate(url, { customFilenameTemplate: 'ignored' })).toBe(
      '{id}_{num:>02}.{extension}'
    )
  })

  it.each([
    'https://threads.com.evil.test/@user',
    'https://user:password@threads.com/@user',
    'https://threads.com:8080/@user',
    'ftp://threads.com/@user',
    'https://threads.com/@user/replies',
    'https://threads.com/@user/reposts',
    'https://threads.com/@user/post/abc',
    'https://threads.com/@user/post/ABCDE/extra',
    'https://threads.com/@%2e%2e',
    'https://threads.com/@..',
    'https://threads.com/@user//media',
    'invalid'
  ])('does not recognize %s', (url) => {
    expect(normalizeThreadsUrl(url)).toBeNull()
    expect(shouldUseGalleryDl(url)).toBe(false)
    expect(resolveDownloadTaskKind(url, 'video')).toBe('video')
  })
})
