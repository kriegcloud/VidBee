import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'

const COMPANION_EXTENSION = /\.(?:vtt|srt|ass|ssa|lrc|ttml|json|description|jpe?g|png|webp|md)$/i
const INVALID_SKILL_CHARACTERS = /[^a-zA-Z0-9_-]+/g
const MANIFEST = '.vidbee-ai-results.json'

/** Group one video and its exact-stem companions without overwriting files or losing references. */
export async function groupVideoFiles(
  source: string,
  relocate: (from: string, to: string) => Promise<void>
): Promise<string> {
  if (!lstatSync(source).isFile()) {
    throw new Error('Video must be a regular file')
  }
  const parent = path.dirname(source)
  const stem = path.basename(source, path.extname(source))
  if (path.basename(parent) === stem) {
    return source
  }
  const directory = path.join(parent, stem)
  const created = !existsSync(directory)
  if (!(created || lstatSync(directory).isDirectory())) {
    throw new Error('Video folder must be a regular directory')
  }
  const names = readdirSync(parent).filter(
    (name) =>
      name === path.basename(source) ||
      (name.startsWith(`${stem}.`) && COMPANION_EXTENSION.test(name))
  )
  const files = names.map((name) => ({
    from: path.join(parent, name),
    to: path.join(directory, name)
  }))
  for (const file of files) {
    if (!lstatSync(file.from).isFile() || existsSync(file.to)) {
      throw new Error('Video grouping refused a non-regular file or destination collision')
    }
  }
  mkdirSync(directory, { recursive: true })
  const linked: typeof files = []
  const relocated: typeof files = []
  try {
    for (const file of files) {
      linkSync(file.from, file.to)
      linked.push(file)
    }
    for (const file of files) {
      await relocate(file.from, file.to)
      relocated.push(file)
    }
    for (const file of files) {
      unlinkSync(file.from)
    }
  } catch (error) {
    // Restore original names before restoring references. Retain both copies if rollback fails.
    for (const file of linked) {
      if (!existsSync(file.from)) {
        linkSync(file.to, file.from)
      }
    }
    for (const file of relocated.reverse()) {
      await relocate(file.to, file.from)
    }
    for (const file of linked) {
      unlinkSync(file.to)
    }
    if (created) {
      rmdirSync(directory)
    }
    throw error
  }
  return path.join(directory, path.basename(source))
}

export interface VideoSkillDocument {
  skill: string
  text: string
  title: string
  sourceUrl?: string
  model?: string
  runId: string
  createdAt: number
}

interface OwnedResult {
  hash: string
  createdAt: number
}

const digest = (text: string): string => createHash('sha256').update(text).digest('hex')

/** Write a complete file atomically, keeping temporary files next to the destination. */
function writeAtomic(file: string, text: string): void {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' })
    renameSync(temporary, file)
  } finally {
    if (existsSync(temporary)) {
      unlinkSync(temporary)
    }
  }
}

/** Save the latest successful skill answer, preserving externally edited Markdown. */
export function writeVideoSkillDocument(
  media: string,
  document: VideoSkillDocument
): string | null {
  if (!document.text.trim()) {
    return null
  }
  const skill = document.skill.replace(INVALID_SKILL_CHARACTERS, '-').replace(/^-+|-+$/g, '')
  if (!skill) {
    throw new Error('Skill name cannot produce a safe filename')
  }
  const directory = path.dirname(media)
  const manifestPath = path.join(directory, MANIFEST)
  let manifest: Record<string, OwnedResult> = {}
  if (existsSync(manifestPath)) {
    if (!lstatSync(manifestPath).isFile()) {
      throw new Error('AI result manifest must be a regular file')
    }
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, OwnedResult>
  }
  let name = `${skill}.md`
  const previous = manifest[name]
  if (previous && previous.createdAt > document.createdAt) {
    return null
  }
  const metadata = {
    title: document.title,
    skill: document.skill,
    model: document.model,
    generated_at: new Date(document.createdAt).toISOString(),
    media: `./${path.basename(media)}`,
    source_url: document.sourceUrl
  }
  const frontmatter = Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')
  const text = `---\n${frontmatter}\n---\n\n${document.text.trim()}\n`
  let file = path.join(directory, name)
  if (existsSync(file)) {
    if (!lstatSync(file).isFile()) {
      throw new Error('AI result destination must be a regular file')
    }
    const existing = readFileSync(file, 'utf8')
    if (existing === text) {
      return file
    }
    if (digest(existing) !== previous?.hash) {
      const revision = document.runId.replace(INVALID_SKILL_CHARACTERS, '-')
      name = `${skill}.generated-${revision}.md`
      file = path.join(directory, name)
      if (existsSync(file)) {
        if (lstatSync(file).isFile() && readFileSync(file, 'utf8') === text) {
          return file
        }
        throw new Error('AI result revision already exists; keeping both existing files')
      }
    }
  }
  writeAtomic(file, text)
  manifest[name] = { hash: digest(text), createdAt: document.createdAt }
  writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return file
}
