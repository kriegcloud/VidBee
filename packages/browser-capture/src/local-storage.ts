import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const SSTABLE_MAGIC = Buffer.from([0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb])

const readVarint = (buf: Buffer, start: number): { value: number; pos: number } => {
  let result = 0
  let shift = 0
  let pos = start
  while (pos < buf.length) {
    const byte = buf[pos] ?? 0
    pos += 1
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) {
      return { pos, value: result }
    }
    shift += 7
  }
  throw new Error('truncated varint')
}

const snappyDecompressRaw = (data: Buffer): Buffer | null => {
  try {
    const preamble = readVarint(data, 0)
    let pos = preamble.pos
    const out: number[] = []
    while (pos < data.length) {
      const tag = data[pos] ?? 0
      pos += 1
      const kind = tag & 0x03
      if (kind === 0) {
        let size = tag >> 2
        if (size >= 60) {
          const nbytes = size - 59
          size = data.subarray(pos, pos + nbytes).readUIntLE(0, nbytes) + 1
          pos += nbytes
        } else {
          size += 1
        }
        for (let i = 0; i < size; i += 1) {
          out.push(data[pos + i] ?? 0)
        }
        pos += size
        continue
      }
      let length = 0
      let offset = 0
      if (kind === 1) {
        length = ((tag >> 2) & 0x07) + 4
        offset = ((tag & 0xe0) << 3) | (data[pos] ?? 0)
        pos += 1
      } else if (kind === 2) {
        length = (tag >> 2) + 1
        offset = data.readUInt16LE(pos)
        pos += 2
      } else {
        length = (tag >> 2) + 1
        offset = data.readUInt32LE(pos)
        pos += 4
      }
      if (offset <= 0 || offset > out.length) {
        return null
      }
      for (let i = 0; i < length; i += 1) {
        out.push(out[out.length - offset] ?? 0)
      }
    }
    return Buffer.from(out)
  } catch {
    return null
  }
}

const blockAt = (data: Buffer, offset: number, size: number): Buffer | null => {
  const raw = data.subarray(offset, offset + size)
  const compression = data[offset + size]
  if (compression === 0) {
    return raw
  }
  if (compression === 1) {
    return snappyDecompressRaw(raw)
  }
  return null
}

const sstableBlocks = (data: Buffer): Buffer[] => {
  if (data.length < 53 || !data.subarray(data.length - 8).equals(SSTABLE_MAGIC)) {
    return []
  }
  try {
    const footer = data.subarray(data.length - 48)
    let pos = 0
    ;({ pos } = readVarint(footer, pos))
    ;({ pos } = readVarint(footer, pos))
    const indexOff = readVarint(footer, pos)
    const indexSize = readVarint(footer, indexOff.pos)
    const index = blockAt(data, indexOff.value, indexSize.value)
    if (!index) {
      return []
    }
    const blocks: Buffer[] = []
    pos = 0
    while (pos < index.length - 4) {
      ;({ pos } = readVarint(index, pos))
      const keyLen = readVarint(index, pos)
      const valLen = readVarint(index, keyLen.pos)
      pos = valLen.pos + keyLen.value
      const handle = index.subarray(pos, pos + valLen.value)
      pos += valLen.value
      const blockOff = readVarint(handle, 0)
      const blockSize = readVarint(handle, blockOff.pos)
      const block = blockAt(data, blockOff.value, blockSize.value)
      if (block) {
        blocks.push(block)
      }
    }
    return blocks
  } catch {
    return []
  }
}

const findValue = (blob: Buffer, key: string, valueRe: RegExp): string | null => {
  const encodings = ['latin1', 'utf16le'] as const
  for (const encoding of encodings) {
    const needle = Buffer.from(key, encoding)
    let start = 0
    while (start < blob.length) {
      const idx = blob.indexOf(needle, start)
      if (idx < 0) {
        break
      }
      start = idx + 1
      const window = blob.subarray(idx, idx + 400)
      const text = window.toString(encoding)
      const match = text.match(valueRe)
      if (match?.[0]) {
        return match[0]
      }
    }
  }
  return null
}

const copyLeveldb = async (sourceDir: string, destDir: string): Promise<string[]> => {
  const names = await readdir(sourceDir)
  const copied: string[] = []
  for (const name of names) {
    if (name === 'LOCK' || name.startsWith('LOG')) {
      continue
    }
    if (!(name.endsWith('.log') || name.endsWith('.ldb'))) {
      continue
    }
    const dest = path.join(destDir, name)
    await copyFile(path.join(sourceDir, name), dest)
    copied.push(dest)
  }
  return copied
}

/**
 * Best-effort read of a Chromium localStorage value from a profile directory.
 *
 * Copies `Local Storage/leveldb` aside (the live browser holds the lock) and
 * scans WAL `.log` files plus snappy `.ldb` blocks for `key` followed by a
 * value matching `valueRe`.
 */
export const readLocalStorageValue = async (
  profileDir: string,
  key: string,
  valueRe = /[0-9a-f]{40}/
): Promise<string | null> => {
  const leveldbDir = path.join(profileDir, 'Local Storage', 'leveldb')
  const tmp = await mkdtemp(path.join(tmpdir(), 'vidbee-ls-'))
  try {
    const files = await copyLeveldb(leveldbDir, tmp)
    files.sort()
    files.reverse()
    for (const file of files) {
      const data = await readFile(file)
      const blobs = file.endsWith('.log') ? [data] : sstableBlocks(data)
      for (const blob of blobs) {
        const value = findValue(blob, key, valueRe)
        if (value) {
          return value
        }
      }
    }
  } catch {
    return null
  } finally {
    await rm(tmp, { force: true, recursive: true })
  }
  return null
}
