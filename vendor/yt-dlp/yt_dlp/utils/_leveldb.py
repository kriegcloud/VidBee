"""Minimal read-only reader for Chromium localStorage leveldb stores.

Only what is needed to recover a small ASCII value (e.g. OnlyFans' bcTokenSha)
by key name, without a leveldb/snappy dependency. Handles the write-ahead log
(.log, uncompressed records) and SSTables (.ldb, snappy-compressed blocks).
The store is copied to a temp dir first since the browser holds the lock.
"""

import glob
import os
import re
import shutil
import struct
import tempfile

_SSTABLE_MAGIC = b'\x57\xfb\x80\x8b\x24\x75\x47\xdb'


def _read_varint(buf, pos):
    result = shift = 0
    while pos < len(buf):
        byte = buf[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, pos
        shift += 7
    raise ValueError('truncated varint')


def _snappy_decompress_raw(data):
    """Decompress a raw (unframed) snappy block."""
    _, pos = _read_varint(data, 0)  # uncompressed length preamble (trusted)
    out = bytearray()
    while pos < len(data):
        tag = data[pos]
        pos += 1
        kind = tag & 0x03
        if kind == 0:  # literal
            size = tag >> 2
            if size < 60:
                size += 1
            else:
                nbytes = size - 59
                size = int.from_bytes(data[pos:pos + nbytes], 'little') + 1
                pos += nbytes
            out += data[pos:pos + size]
            pos += size
            continue
        if kind == 1:  # copy, 1-byte offset
            length = ((tag >> 2) & 0x7) + 4
            offset = ((tag & 0xE0) << 3) | data[pos]
            pos += 1
        elif kind == 2:  # copy, 2-byte offset
            length = (tag >> 2) + 1
            offset = struct.unpack_from('<H', data, pos)[0]
            pos += 2
        else:  # copy, 4-byte offset
            length = (tag >> 2) + 1
            offset = struct.unpack_from('<I', data, pos)[0]
            pos += 4
        for _ in range(length):  # byte-by-byte handles overlapping copies
            out.append(out[-offset])
    return bytes(out)


def _sstable_blocks(data):
    """Yield decompressed data blocks of an SSTable (.ldb)."""
    if len(data) < 53 or data[-8:] != _SSTABLE_MAGIC:
        return

    def block_at(offset, size):
        raw = data[offset:offset + size]
        compression = data[offset + size]
        if compression == 0:
            return raw
        if compression == 1:
            try:
                return _snappy_decompress_raw(raw)
            except Exception:
                return None
        return None

    try:
        _, pos = _read_varint(data[-48:], 0)  # metaindex handle, unused
        _, pos = _read_varint(data[-48:], pos)
        index_off, pos = _read_varint(data[-48:], pos)
        index_size, _ = _read_varint(data[-48:], pos)
    except ValueError:
        return
    index = block_at(index_off, index_size)
    if index is None:
        return
    pos = 0
    while pos < len(index) - 4:
        try:
            _, pos = _read_varint(index, pos)  # shared key prefix length
            key_len, pos = _read_varint(index, pos)
            val_len, pos = _read_varint(index, pos)
            pos += key_len  # skip key delta; only the block handle matters
            handle = index[pos:pos + val_len]
            pos += val_len
            block_off, hpos = _read_varint(handle, 0)
            block_size, _ = _read_varint(handle, hpos)
        except (ValueError, IndexError):
            break
        block = block_at(block_off, block_size)
        if block is not None:
            yield block


def _find_value(blob, key, value_re):
    """Find `key` in a raw blob and extract the value stored after it.

    localStorage entries store key and value adjacently, each in latin-1 or
    UTF-16LE depending on an encoding flag byte.
    """
    for encoding in ('latin-1', 'utf-16-le'):
        start = 0
        while True:
            idx = blob.find(key.encode(encoding), start)
            if idx == -1:
                break
            start = idx + 1
            window = blob[idx:idx + 400]
            if encoding == 'latin-1':
                match = re.search(value_re, window)
                if match:
                    return match.group(0).decode('latin-1')
            else:
                # UTF-16LE: each ASCII byte followed by a NUL
                wide_re = re.sub(rb'[\x20-\x7e]', lambda m: re.escape(m.group(0)) + rb'\x00', value_re)
                match = re.search(wide_re, window)
                if match:
                    return match.group(0).decode('utf-16-le')
    return None


def read_localstorage_value(profile_dir, key, value_re=rb'[0-9a-f]{40}'):
    """Best-effort read of a localStorage value from a Chromium profile.

    Copies `<profile_dir>/Local Storage/leveldb` to a temp dir and scans it.
    Returns the decoded value string, or None if not found.
    """
    leveldb_dir = os.path.join(profile_dir, 'Local Storage', 'leveldb')
    if not os.path.isdir(leveldb_dir):
        return None
    with tempfile.TemporaryDirectory(prefix='yt-dlp-ls-') as tmp:
        try:
            shutil.copytree(leveldb_dir, tmp, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns('LOCK', 'LOG*'))
        except OSError:
            return None
        files = sorted(
            glob.glob(os.path.join(tmp, '*.log')) + glob.glob(os.path.join(tmp, '*.ldb')),
            key=os.path.getmtime, reverse=True)
        for path in files:
            try:
                with open(path, 'rb') as f:
                    data = f.read()
            except OSError:
                continue
            blobs = [data] if path.endswith('.log') else _sstable_blocks(data)
            for blob in blobs:
                value = _find_value(blob, key, value_re)
                if value is not None:
                    return value
    return None
