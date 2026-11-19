import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Predicate from "effect/Predicate";
import * as Str from "effect/String";
import { HostFailure } from "./Capture.errors.js";
import { CaptureFiles } from "./CaptureFiles.service.js";
import { CaptureHost } from "./CaptureHost.service.js";

const readUnsigned = (data: Uint8Array, offset: number, count: number): number => {
  if (count < 1 || count > 6 || offset < 0 || offset + count > data.length)
    throw new RangeError("Invalid integer read");
  let value = 0;
  for (let i = 0; i < count; i += 1) value += (data[offset + i] ?? 0) * 2 ** (8 * i);
  return value;
};
const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
};
const encodeKey = (key: string, utf16: boolean): Uint8Array => {
  if (typeof key !== "string") throw new TypeError("Invalid storage key");
  const bytes = new Uint8Array(key.length * (utf16 ? 2 : 1));
  for (let i = 0; i < key.length; i += 1) {
    bytes[i * (utf16 ? 2 : 1)] = Option.getOrElse(Str.charCodeAt(key, i), () => Number.NaN) & 255;
    if (utf16) bytes[i * 2 + 1] = Option.getOrElse(Str.charCodeAt(key, i), () => Number.NaN) >>> 8;
  }
  return bytes;
};
const indexOfBytes = (data: Uint8Array, needle: Uint8Array, start: number): number => {
  for (let i = start; i <= data.length - needle.length; i += 1) {
    let matches = true;
    for (let j = 0; j < needle.length; j += 1)
      if (data[i + j] !== needle[j]) {
        matches = false;
        break;
      }
    if (matches) return i;
  }
  return -1;
};
const decodeWindow = (data: Uint8Array, utf16: boolean): string => {
  let text = "";
  for (let i = 0; i + (utf16 ? 1 : 0) < data.length; i += utf16 ? 2 : 1)
    text += String.fromCharCode((data[i] ?? 0) | (utf16 ? (data[i + 1] ?? 0) << 8 : 0));
  return text;
};
const SSTABLE_MAGIC = new Uint8Array([0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb]);

const readVarint = (buf: Uint8Array, start: number): { value: number; pos: number } => {
  let result = 0;
  let shift = 0;
  let pos = start;
  while (pos < buf.length) {
    const byte = buf[pos] ?? 0;
    pos += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { pos, value: result };
    }
    shift += 7;
  }
  throw new Error("truncated varint");
};

const snappyDecompressRaw = (data: Uint8Array): Uint8Array | null => {
  try {
    const preamble = readVarint(data, 0);
    let pos = preamble.pos;
    const out: number[] = [];
    while (pos < data.length) {
      const tag = data[pos] ?? 0;
      pos += 1;
      const kind = tag & 0x03;
      if (kind === 0) {
        let size = tag >> 2;
        if (size >= 60) {
          const nbytes = size - 59;
          size = readUnsigned(data.subarray(pos, pos + nbytes), 0, nbytes) + 1;
          pos += nbytes;
        } else {
          size += 1;
        }
        for (let i = 0; i < size; i += 1) {
          out.push(data[pos + i] ?? 0);
        }
        pos += size;
        continue;
      }
      let length = 0;
      let offset = 0;
      if (kind === 1) {
        length = ((tag >> 2) & 0x07) + 4;
        offset = ((tag & 0xe0) << 3) | (data[pos] ?? 0);
        pos += 1;
      } else if (kind === 2) {
        length = (tag >> 2) + 1;
        offset = readUnsigned(data, pos, 2);
        pos += 2;
      } else {
        length = (tag >> 2) + 1;
        offset = readUnsigned(data, pos, 4);
        pos += 4;
      }
      if (offset <= 0 || offset > out.length) {
        return null;
      }
      for (let i = 0; i < length; i += 1) {
        out.push(out[out.length - offset] ?? 0);
      }
    }
    return new Uint8Array(out);
  } catch {
    return null;
  }
};

const blockAt = (data: Uint8Array, offset: number, size: number): Uint8Array | null => {
  const raw = data.subarray(offset, offset + size);
  const compression = data[offset + size];
  if (compression === 0) {
    return raw;
  }
  if (compression === 1) {
    return snappyDecompressRaw(raw);
  }
  return null;
};

const sstableBlocks = (data: Uint8Array): Uint8Array[] => {
  if (data.length < 53 || !sameBytes(data.subarray(data.length - 8), SSTABLE_MAGIC)) {
    return [];
  }
  try {
    const footer = data.subarray(data.length - 48);
    let pos = 0;
    ({ pos } = readVarint(footer, pos));
    ({ pos } = readVarint(footer, pos));
    const indexOff = readVarint(footer, pos);
    const indexSize = readVarint(footer, indexOff.pos);
    const index = blockAt(data, indexOff.value, indexSize.value);
    if (index === null) {
      return [];
    }
    const blocks: Uint8Array[] = [];
    pos = 0;
    while (pos < index.length - 4) {
      ({ pos } = readVarint(index, pos));
      const keyLen = readVarint(index, pos);
      const valLen = readVarint(index, keyLen.pos);
      pos = valLen.pos + keyLen.value;
      const handle = index.subarray(pos, pos + valLen.value);
      pos += valLen.value;
      const blockOff = readVarint(handle, 0);
      const blockSize = readVarint(handle, blockOff.pos);
      const block = blockAt(data, blockOff.value, blockSize.value);
      if (block !== null) {
        blocks.push(block);
      }
    }
    return blocks;
  } catch {
    return [];
  }
};

const findValue = (blob: Uint8Array, key: string, valueRe: RegExp): string | null => {
  const encodings = [false, true];
  for (const encoding of encodings) {
    const needle = encodeKey(key, encoding);
    let start = 0;
    while (start < blob.length) {
      const idx = indexOfBytes(blob, needle, start);
      if (idx < 0) {
        break;
      }
      start = idx + 1;
      const window = blob.subarray(idx, idx + 400);
      const text = decodeWindow(window, encoding);
      const match = Str.match(valueRe)(text);
      if (Option.isSome(match) && Predicate.isTruthy(match.value[0])) {
        return match.value[0] ?? null;
      }
    }
  }
  return null;
};

/** Best-effort nearby-byte scan of a copied Chromium LevelDB directory. */
export const readLocalStorageValue = Effect.fn("readLocalStorageValue")(function* (
  profileDir: string,
  key: string,
  valueRe = /[0-9a-f]{40}/
) {
  const files = yield* CaptureFiles;
  const host = yield* CaptureHost;
  const path = yield* Path.Path;
  const snapshot = yield* host.snapshot;
  const leveldbDir = path.join(profileDir, "Local Storage", "leveldb");
  const tmp = yield* files.tempDirectory(path.join(snapshot.temp, "vidbee-ls-"));
  const work = Effect.fnUntraced(function* () {
    const names = yield* files.list(leveldbDir);
    const copied: string[] = [];
    for (const name of names) {
      if (name === "LOCK" || Str.startsWith("LOG")(name)) continue;
      if (!(Str.endsWith(".log")(name) || Str.endsWith(".ldb")(name))) continue;
      const dest = path.join(tmp, name);
      yield* files.copy(path.join(leveldbDir, name), dest);
      copied.push(dest);
    }
    copied.sort();
    copied.reverse();
    for (const file of copied) {
      const data = yield* files.readBytes(file);
      const blobs = Str.endsWith(".log")(file) ? [data] : sstableBlocks(data);
      for (const blob of blobs) {
        const value = yield* Effect.try({
          try: () => findValue(blob, key, valueRe),
          catch: (cause) =>
            HostFailure.make({
              operation: "localStorage",
              cause,
              legacyMessage: cause instanceof Error ? cause.message : String(cause),
            }),
        });
        if (value !== null && Predicate.isTruthy(value)) return value;
      }
    }
    return null;
  });
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(restore(work().pipe(Effect.orElseSucceed(() => null))));
      yield* files.remove(tmp, { force: true, recursive: true });
      if (Exit.isFailure(result)) return yield* Effect.failCause(result.cause);
      return result.value;
    })
  );
});
