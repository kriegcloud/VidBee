import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  groupVideoFiles,
  type VideoSkillDocument,
  writeVideoSkillDocument
} from '../src/main/lib/video-library-files'

const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'vidbee-library-'))
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) }
}
const document: VideoSkillDocument = {
  skill: 'overview',
  text: '# Overview\n\nA useful summary.',
  title: 'Video',
  model: 'gpt-6.1-sol',
  runId: 'run-1',
  createdAt: 1_800_000_000_000
}

test('groups the media and its captions, keeping unrelated files and updating references', async () => {
  const { root, clean } = fixture()
  try {
    for (const name of [
      'Video.mp4',
      'Video.en.vtt',
      'Video.srt',
      'Video.jpg',
      'Video 2.vtt',
      'Video.mp4.part'
    ]) {
      writeFileSync(path.join(root, name), name)
    }
    const moved: string[] = []
    const media = await groupVideoFiles(path.join(root, 'Video.mp4'), async (from, to) => {
      assert.ok(existsSync(from) && existsSync(to))
      moved.push(path.basename(from))
    })
    assert.equal(media, path.join(root, 'Video/Video.mp4'))
    assert.equal(readFileSync(media, 'utf8'), 'Video.mp4')
    assert.deepEqual(moved.sort(), ['Video.en.vtt', 'Video.jpg', 'Video.mp4', 'Video.srt'])
    assert.ok(existsSync(path.join(root, 'Video 2.vtt')))
    assert.ok(existsSync(path.join(root, 'Video.mp4.part')))
    assert.equal(await groupVideoFiles(media, async () => assert.fail('already grouped')), media)
  } finally {
    clean()
  }
})

test('rolls back all links and reference updates when persistence rejects an active task', async () => {
  const { root, clean } = fixture()
  try {
    writeFileSync(path.join(root, 'Video.mp4'), 'media')
    writeFileSync(path.join(root, 'Video.vtt'), 'captions')
    const calls: string[] = []
    await assert.rejects(
      groupVideoFiles(path.join(root, 'Video.mp4'), async (from, to) => {
        calls.push(`${from}>${to}`)
        if (path.basename(from) === 'Video.vtt' && path.dirname(from) === root) {
          throw new Error('active dependent task')
        }
      }),
      /active dependent task/
    )
    assert.equal(readFileSync(path.join(root, 'Video.mp4'), 'utf8'), 'media')
    assert.equal(readFileSync(path.join(root, 'Video.vtt'), 'utf8'), 'captions')
    assert.equal(existsSync(path.join(root, 'Video')), false)
    assert.equal(calls.length, 3)
  } finally {
    clean()
  }
})

test('refuses collisions and symlink destinations without moving the source', async () => {
  const { root, clean } = fixture()
  try {
    const media = path.join(root, 'Video.mp4')
    writeFileSync(media, 'original')
    mkdirSync(path.join(root, 'Video'))
    writeFileSync(path.join(root, 'Video/Video.mp4'), 'existing')
    await assert.rejects(
      groupVideoFiles(media, async () => undefined),
      /collision/
    )
    assert.equal(readFileSync(media, 'utf8'), 'original')
    rmSync(path.join(root, 'Video'), { recursive: true })
    mkdirSync(path.join(root, 'elsewhere'))
    symlinkSync(path.join(root, 'elsewhere'), path.join(root, 'Video'))
    await assert.rejects(
      groupVideoFiles(media, async () => undefined),
      /regular directory/
    )
  } finally {
    clean()
  }
})

test('writes successful Markdown atomically and keeps Mermaid, metadata and the latest result', () => {
  const { root, clean } = fixture()
  try {
    const media = path.join(root, 'Video.mp4')
    writeFileSync(media, 'media')
    const first = writeVideoSkillDocument(media, document)
    assert.equal(first, path.join(root, 'overview.md'))
    assert.match(readFileSync(first, 'utf8'), /media: "\.\/Video.mp4"/)
    const next = {
      ...document,
      text: '```mermaid\nmindmap\n  root((Video))\n```',
      runId: 'run-2',
      createdAt: document.createdAt + 1
    }
    assert.equal(writeVideoSkillDocument(media, next), first)
    assert.match(readFileSync(first, 'utf8'), /```mermaid/)
    assert.equal(writeVideoSkillDocument(media, document), null)
    assert.equal(writeVideoSkillDocument(media, { ...next, text: ' ' }), null)
    assert.ok(readdirSync(root).every((name) => !name.endsWith('.tmp')))
  } finally {
    clean()
  }
})

test('preserves manually edited Markdown and writes an idempotent separate generated result', () => {
  const { root, clean } = fixture()
  try {
    const media = path.join(root, 'Video.mp4')
    writeFileSync(media, 'media')
    const first = writeVideoSkillDocument(media, document)
    assert.ok(first)
    writeFileSync(first, 'My manual notes')
    const next = {
      ...document,
      text: 'New result',
      runId: 'run-2',
      createdAt: document.createdAt + 1
    }
    const revision = writeVideoSkillDocument(media, next)
    assert.equal(revision, path.join(root, 'overview.generated-run-2.md'))
    assert.equal(readFileSync(first, 'utf8'), 'My manual notes')
    assert.equal(writeVideoSkillDocument(media, next), revision)
    assert.equal(readdirSync(root).filter((name) => name.endsWith('.md')).length, 2)
  } finally {
    clean()
  }
})

test('sanitizes custom skill paths and refuses result symlinks', () => {
  const { root, clean } = fixture()
  try {
    const media = path.join(root, 'Video.mp4')
    const file = writeVideoSkillDocument(media, { ...document, skill: '../../custom/skill' })
    assert.equal(file, path.join(root, 'custom-skill.md'))
    symlinkSync(file, path.join(root, 'overview.md'))
    assert.throws(() => writeVideoSkillDocument(media, document), /regular file/)
  } finally {
    clean()
  }
})
