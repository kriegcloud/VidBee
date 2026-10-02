"""VidBee collection adapter for the pinned gallery-dl runtime.

Upstream extractors own site protocols. This adapter owns scope, strict image
quality, durable deduplication, and a versioned JSON-lines completion protocol.
"""
import datetime
import hashlib
import json
import logging
import os
import re
import sqlite3
import struct
import time
from urllib.parse import urlsplit, urlunsplit
import html

from gallery_dl import config, extractor, exception
from gallery_dl.extractor.common import Extractor, Message

PREFIX = "__VIDBEE_SOCIAL__\t"
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif", "bmp"}
VIDEO_EXTENSIONS = {"mp4", "webm", "mov", "mkv", "m4v", "gifv", "ts"}
AUDIO_EXTENSIONS = {"mp3", "m4a", "aac", "ogg", "opus", "wav"}
SOCIAL = {"twitter", "reddit", "tiktok", "instagram"}
MEDIA_HOSTS = {"imgur", "redgifs", "gfycat", "twitter", "reddit", "tiktok", "instagram"}
LINKED_CATEGORIES = {
    "twitter": {"tweet", "image"}, "reddit": {"submission", "image", "redirect"},
    "tiktok": {"post", "vmpost"}, "instagram": {"post"}, "imgur": {"image", "album", "gallery"},
    "redgifs": {"image"}, "gfycat": {"gfycat"},
}
GRAPH_CATEGORIES = {"following", "followers", "list-members"}


def safe(value):
    value = re.sub(r"[^\w.-]", "_", str(value or "unknown"), flags=re.ASCII).strip(". ")
    return value[:120] or "unknown"


def digest(filename):
    with open(filename, "rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def dimensions(filename):
    """Read dimensions without decoding or rewriting the original image bytes."""
    with open(filename, "rb") as handle:
        data = handle.read(32)
        if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
            return struct.unpack(">II", data[16:24])
        if data[:6] in (b"GIF87a", b"GIF89a"):
            return struct.unpack("<HH", data[6:10])
        if data[:2] == b"\xff\xd8":
            handle.seek(2)
            while True:
                byte = handle.read(1)
                if not byte:
                    raise ValueError("Truncated JPEG")
                if byte != b"\xff":
                    continue
                marker = handle.read(1)
                while marker == b"\xff":
                    marker = handle.read(1)
                if marker in (b"\xd8", b"\x01") or (marker and 0xD0 <= marker[0] <= 0xD7):
                    continue
                if marker in (b"\xd9", b"\xda", b""):
                    break
                raw = handle.read(2)
                if len(raw) != 2:
                    break
                length = int.from_bytes(raw, "big")
                if length < 2:
                    break
                if marker[0] in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    frame = handle.read(5)
                    height, width = struct.unpack(">HH", frame[1:5])
                    return width, height
                handle.seek(length - 2, 1)
            raise ValueError("JPEG dimensions missing")
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            if data[12:16] == b"VP8X":
                return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
            if data[12:16] == b"VP8L" and data[20] == 0x2F:
                bits = int.from_bytes(data[21:25], "little")
                return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
            if data[12:16] == b"VP8 " and data[23:26] == b"\x9d\x01\x2a":
                width, height = struct.unpack("<HH", data[26:30])
                return width & 0x3FFF, height & 0x3FFF
        # AVIF/HEIF store dimensions in an ispe full box. Bound the header scan.
        if data[4:8] == b"ftyp":
            handle.seek(0)
            header = handle.read(1024 * 1024)
            offset = header.find(b"ispe")
            if offset >= 0 and len(header) >= offset + 16:
                return struct.unpack(">II", header[offset + 8:offset + 16])
        if data[:2] == b"BM":
            return struct.unpack("<ii", data[18:26])
    raise ValueError("Unrecognized or unreadable image; highest-quality verification failed")


class Manifest:
    def __init__(self, root, run_id):
        private = os.path.join(root, ".vidbee")
        os.makedirs(private, mode=0o700, exist_ok=True)
        self.path = os.path.join(private, "social-media.sqlite")
        if os.path.islink(private) or os.path.islink(self.path):
            raise exception.AbortExtraction("Manifest directory contains an unsafe symbolic link")
        self.db = sqlite3.connect(self.path, timeout=30)
        os.chmod(self.path, 0o600)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, path TEXT, size INTEGER, sha256 TEXT, width INTEGER, height INTEGER, quality TEXT)")
        self.db.execute("CREATE INDEX IF NOT EXISTS assets_sha256 ON assets (sha256)")
        self.db.execute("CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, summary TEXT NOT NULL)")
        self.db.execute("CREATE TEMP TABLE seen (kind TEXT, id TEXT, PRIMARY KEY(kind,id))")
        self.run_id = run_id

    def first(self, kind, value):
        result = self.db.execute("INSERT OR IGNORE INTO seen VALUES (?,?)", (kind, str(value)))
        return result.rowcount == 1

    def verified(self, key, path, width, height, allow_account_alias=False):
        row = self.db.execute("SELECT path,size,sha256,width,height,quality FROM assets WHERE id=?", (key,)).fetchone()
        if not row or row[5] != "highest-v1":
            return None
        saved, size, sha256, saved_width, saved_height, _ = row
        # CDNs can return JPEG bytes for a .webp URL. gallery-dl corrects the
        # extension; keep those native bytes and find the verified final path.
        same_asset_path = (os.path.dirname(saved) == os.path.dirname(path) and
                           os.path.splitext(os.path.basename(saved))[0] == os.path.splitext(os.path.basename(path))[0])
        account_directory = os.path.dirname(path)
        account_alias = (allow_account_alias and
                         os.path.commonpath((saved, account_directory)) == account_directory)
        if not (same_asset_path or account_alias) or os.path.realpath(saved) != saved:
            return None
        try:
            if (os.path.isfile(saved) and os.path.getsize(saved) == size and size > 0 and
                    (not width or saved_width >= width) and (not height or saved_height >= height) and
                    digest(saved) == sha256):
                return saved
        except OSError:
            pass
        return None

    def duplicate_content(self, path, width, height):
        sha256 = digest(path)
        account_directory = os.path.dirname(path)
        for saved, size, saved_width, saved_height in self.db.execute(
                "SELECT path,size,width,height FROM assets WHERE sha256=? AND quality='highest-v1'", (sha256,)):
            if saved == path or os.path.realpath(saved) != saved:
                continue
            if os.path.commonpath((saved, account_directory)) != account_directory:
                continue
            if (os.path.isfile(saved) and os.path.getsize(saved) == size and size > 0 and
                    (not width or saved_width >= width) and (not height or saved_height >= height) and
                    digest(saved) == sha256):
                return saved
        return None

    def alias(self, key, saved):
        self.db.execute("INSERT OR REPLACE INTO assets SELECT ?,path,size,sha256,width,height,quality FROM assets WHERE path=? LIMIT 1", (key, saved))
        self.db.commit()

    def record(self, key, path, width, height):
        size = os.path.getsize(path)
        if size <= 0:
            raise ValueError("Empty media file")
        self.db.execute("INSERT OR REPLACE INTO assets VALUES (?,?,?,?,?,?,?)", (key, path, size, digest(path), width, height, "highest-v1"))
        self.db.commit()
        return size

    def summary(self, summary):
        self.db.execute("INSERT OR REPLACE INTO runs VALUES (?,?)", (self.run_id, json.dumps(summary)))
        self.db.commit()


def record_asset(data):
    """gallery-dl's built-in Python postprocessor calls this only after success."""
    adapter = data["_extr"]
    adapter.record(data, str(data["_path"]))


class ErrorCapture(logging.Handler):
    def __init__(self, adapter):
        super().__init__(logging.WARNING)
        self.adapter = adapter

    def emit(self, record):
        # Upstream can log a missing post/asset and exit zero. Do not call that
        # an exhausted collection. Rate-limit waits themselves are not errors.
        message = record.getMessage().lower()
        if record.levelno >= logging.ERROR or any(word in message for word in (
                "missing", "unavailable", "failed", "could not", "unable to", "skipping item", "deleted", "error while")):
            self.adapter.extraction_error = True


class VidBeeSocialExtractor(Extractor):
    category = "vidbee-social"
    subcategory = "collection"
    pattern = r"vidbee-social:(https?://.+)"
    directory_fmt = ("{vb_platform}", "{vb_owner}", "{vb_post}")
    filename_fmt = "{vb_asset}.{extension}"
    cookies_domain = None

    def _init(self):
        self.inspect_mode = self.config("inspect", False)
        self.source_url = self.groups[0]
        self.options = self.config("options", {})
        self.source = self.config("source", {})
        if self.source.get("platform") in ("tiktok", "x"):
            self.directory_fmt = ("{vb_platform}", "{vb_owner}")
            self.filename_fmt = "{vb_post}_{vb_asset}.{extension}"
        self.root_directory = os.path.realpath(self.config("destination"))
        self.manifest = Manifest(self.root_directory, self.config("run-id"))
        self.summary = {"posts": 0, "images": 0, "videos": 0, "downloaded": 0,
                        "existing": 0, "failed": 0, "totalSize": 0, "reason": "incomplete",
                        "manifestPath": self.manifest.path, "startedAt": int(time.time() * 1000)}
        self.extraction_error = False
        self.limit_reached = False
        self.asset_done = False
        self.root_author = None
        self.request_sequence = 0
        self.handler = ErrorCapture(self)
        config.set(("extractor", self.category), "postprocessors", [{
            "name": "python", "function": __file__ + ":record_asset", "event": "after"}])
        config.set(("extractor", self.category), "skip", False)
        config.set(("extractor", self.category), "directory", list(self.directory_fmt))
        config.set(("extractor", self.category), "filename", self.filename_fmt)
        config.set(("extractor", self.category), "base-directory", self.root_directory)
        self._configure_sites()

    def _configure_sites(self):
        thread = self.options.get("scope") == "thread" or self.options.get("expandThreads", False)
        settings = {
            "twitter": {"size": ["orig"], "previews": False, "conversations": thread,
                        "showreplies": True, "showmore": True, "replies": True,
                        "retweets": self.source.get("kind") != "profile" and self.source.get("category") != "tweets", "quoted": self.options.get("linkedMedia", True),
                        "text-tweets": True, "videos": True, "ratelimit": "abort:1"},
            "reddit": {"api": "rest", "comments": 500 if thread or self.source.get("category") == "comments" else 0,
                       "morecomments": True, "previews": False, "embeds": True,
                       "videos": "dash", "pinned": True, "recursion": 1 if self.options.get("linkedMedia", True) else 0, "selftext": self.options.get("linkedMedia", True)},
            "tiktok": {"photos": True, "videos": True, "covers": False,
                       "audio": self.options.get("slideshowAudio", False), "subtitles": False},
            "instagram": {"videos": True, "previews": False, "audio": False},
        }
        if thread:
            settings["reddit"]["only"] = False
        for site, values in settings.items():
            for key, value in values.items():
                config.set(("extractor", site), key, value)

    def event(self, kind):
        self.manifest.summary(self.summary)
        print(PREFIX + json.dumps({"type": kind, "summary": self.summary}), flush=True)

    def record(self, data, filename):
        filename = os.path.realpath(filename)
        if os.path.commonpath((filename, self.root_directory)) != self.root_directory:
            raise ValueError("Media path escaped the download directory")
        width = height = 0
        if data["vb_kind"] == "image":
            try:
                width, height = dimensions(filename)
                if width < data["vb_width"] or height < data["vb_height"]:
                    raise ValueError("Image is smaller than the highest available rendition")
            except (ValueError, OSError, struct.error, IndexError):
                os.replace(filename, filename + ".quality-failed")
                self.summary["failed"] += 1
                self.asset_done = True
                self.log.error("Image quality verification failed; lower-quality copies are not accepted")
                self.event("progress")
                return
        if data["vb_platform"] == "X":
            duplicate = self.manifest.duplicate_content(filename, width, height)
            if duplicate:
                os.remove(filename)
                self.manifest.alias(data["vb_key"], duplicate)
                self.asset_done = True
                self.summary["existing"] += 1
                self.summary["totalSize"] += os.path.getsize(duplicate)
                self.event("progress")
                return
        size = self.manifest.record(data["vb_key"], filename, width, height)
        self.asset_done = True
        self.summary["downloaded"] += 1
        self.summary["totalSize"] += size
        self.event("progress")

    def _guard_requests(self, child):
        request = child.request
        self.request_sequence += 1
        sequence = self.request_sequence

        def guarded(url, *args, **kwargs):
            params = kwargs.get("params") or {}
            if isinstance(params, dict):
                cursor = params.get("after") or params.get("cursor") or params.get("maxCursor") or params.get("max_id")
                variables = params.get("variables")
                if isinstance(variables, str):
                    try:
                        cursor = cursor or json.loads(variables).get("cursor")
                    except (ValueError, AttributeError):
                        pass
                if cursor and not self.manifest.first("cursor", f"{sequence}:{urlsplit(url).path}:{cursor}"):
                    raise exception.AbortExtraction("Pagination did not advance; collection is incomplete")
            response = request(url, *args, **kwargs)
            self.event("progress")
            return response
        child.request = guarded

    def _post(self, child, data):
        comment = data.get("comment") or {}
        post_id = str(comment.get("id") or data.get("tweet_id") or data.get("id") or data.get("post_id") or data.get("filename") or "unknown")
        author = comment.get("author") or data.get("author") or data.get("user") or data.get("username") or self.source.get("owner")
        if isinstance(author, dict):
            author = author.get("uniqueId") or author.get("name") or author.get("screen_name") or author.get("username") or author.get("id")
        return post_id, str(author or "unknown")

    def _in_date_range(self, data):
        date = data.get("date") or data.get("created_utc") or data.get("createTime")
        if isinstance(date, (int, float)):
            date = datetime.datetime.fromtimestamp(date, datetime.timezone.utc)
        if isinstance(date, datetime.datetime):
            date = date.date().isoformat()
        elif isinstance(date, str):
            date = date[:10]
        else:
            if (self.options.get("since") or self.options.get("until")) and self.source.get("kind") != "image":
                raise exception.AbortExtraction("Post date is unavailable; cannot apply the requested date limit")
            return True
        return ((not self.options.get("since") or date >= self.options["since"]) and
                (not self.options.get("until") or date <= self.options["until"]))

    def _walk(self, url, depth=0, context=None):
        if not self.manifest.first("url", url):
            return
        child = extractor.find(url)
        if child is None and depth:
            return
        if child is None:
            raise exception.AbortExtraction("Linked media has no supported extractor")
        if depth and child.category not in MEDIA_HOSTS:
            return
        if (depth and not (context or {}).get("graph", False) and
                child.subcategory not in LINKED_CATEGORIES.get(child.category, set())):
            return
        self._guard_requests(child)
        child.log.addHandler(self.handler)
        current = {}
        try:
            child.initialize()
            if self.session is None or depth == 0:
                self.session = child.session
                self.cookies = child.cookies
            expanded = False
            for message, target, original in child.items():
                data = dict(original)
                if message == Message.Directory:
                    current = data
                    expanded = (child.category == "twitter" and self.options.get("expandThreads")
                                and depth == 0 and child.subcategory != "tweet")
                    if expanded:
                        post_id, _ = self._post(child, data)
                        if self._in_date_range(data):
                            yield from self._walk(f"https://x.com/i/web/status/{post_id}", depth + 1)
                        if self.limit_reached:
                            return
                    if (child.category == "twitter" and not expanded and depth < 1
                            and self.options.get("linkedMedia", True) and self._in_date_range(data)):
                        for linked in re.findall(r"https?://[^\s<>]+", data.get("content", "")):
                            linked = linked.rstrip(".,;!)]}")
                            linked_child = extractor.find(linked)
                            if linked_child and linked_child.category in {"imgur", "redgifs", "gfycat"}:
                                yield from self._walk(linked, depth + 1)
                                if self.limit_reached:
                                    return
                    if child.category == "reddit" and data.get("id") and data.get("author"):
                        self.root_author = str(data["author"])
                    continue
                if message == Message.Queue and data.get("_ytdl_manifest"):
                    message, target = Message.Url, "ytdl:" + target.removeprefix("ytdl:")
                    data["extension"] = "mp4"
                if message == Message.Queue:
                    is_graph = depth == 0 and child.subcategory in GRAPH_CATEGORIES
                    # Internal redirects and dispatch are traversal, not link recursion.
                    native = child.category in SOCIAL and extractor.find(target)
                    internal = native and native.category == child.category and (
                        child.subcategory in {"user", "redirect", "vmpost", "hashtag", "quotes"} or is_graph)
                    if internal:
                        yield from self._walk(target, depth if not is_graph else depth + 1,
                                              {"graph": is_graph or (context or {}).get("graph", False)})
                    elif self.options.get("linkedMedia", True) and depth < 1:
                        yield from self._walk(target, depth + 1, {"graph": False})
                    if self.limit_reached:
                        return
                    continue
                if expanded:
                    continue
                if message != Message.Url:
                    continue
                data = {**current, **data}
                if child.category == "reddit" and not self.options.get("linkedMedia", True) and data.get("crosspost_parent_list"):
                    continue
                post_id, author = self._post(child, data)
                if child.category == "twitter" and child.subcategory == "tweet":
                    root = getattr(child, "_user_obj", None) or {}
                    self.root_author = (root.get("legacy") or {}).get("screen_name") or self.root_author
                if self.root_author is None:
                    self.root_author = author
                if self.options.get("authorOnly") and author.lower() != self.root_author.lower():
                    continue
                if not self._in_date_range(data):
                    continue
                post_key = f"{child.category}:{post_id}"
                if self.manifest.first("post", post_key):
                    limit = self.options.get("maxPosts")
                    if limit and self.summary["posts"] >= limit:
                        self.limit_reached = True
                        return
                    self.summary["posts"] += 1
                if child.category == "reddit" and urlsplit(target).hostname in {"preview.redd.it", "i.redd.it"}:
                    parsed = urlsplit(html.unescape(target))
                    target = urlunsplit(("https", "i.redd.it", parsed.path, "", ""))
                ext = str(data.get("extension") or urlsplit(target.removeprefix("ytdl:")).path.rpartition(".")[2]).lower()
                kind = "image" if ext in IMAGE_EXTENSIONS else "video" if ext in VIDEO_EXTENSIONS or target.startswith("ytdl:") else "audio" if ext in AUDIO_EXTENSIONS else "unknown"
                if kind == "unknown":
                    raise exception.AbortExtraction("Unknown media format; collection is incomplete")
                media = self.options.get("media", "all")
                if (kind == "image" and media == "videos") or (kind == "video" and media == "images") or (kind == "audio" and not self.options.get("slideshowAudio")):
                    continue
                if kind == "image":
                    data.pop("_fallback", None)
                if kind == "image" and child.category not in SOCIAL:
                    # Linked hosts must provide their original asset, not a thumbnail.
                    data.pop("_fallback", None)
                asset_id = str(data.get("num") or data.get("file_id") or data.get("filename") or "1")
                # Multiple direct Reddit links can share post ID but no item number.
                if child.category == "reddit":
                    asset_id = hashlib.sha256(urlsplit(target).path.encode()).hexdigest()[:16]
                key = f"{post_key}:{asset_id}:{kind}"
                if not self.manifest.first("asset", key):
                    continue
                width = int(data.get("width") or 0) if kind == "image" else 0
                height = int(data.get("height") or 0) if kind == "image" else 0
                if child.category == "reddit" and kind == "image":
                    media = (data.get("crosspost_parent_list") or [data])[-1]
                    media = (data.get("comment") or media).get("media_metadata") or {}
                    for rendition in media.values():
                        original_image = rendition.get("s") or {}
                        image_url = original_image.get("u") or original_image.get("gif") or ""
                        if urlsplit(image_url).path == urlsplit(target).path:
                            width = int(original_image.get("x") or width)
                            height = int(original_image.get("y") or height)
                            break
                if child.category == "tiktok" and kind == "image":
                    image = data.get("image") or {}
                    width = int(image.get("imageWidth") or width)
                    height = int(image.get("imageHeight") or height)
                platform = {"twitter": "X", "reddit": "Reddit", "tiktok": "TikTok", "instagram": "Instagram"}.get(child.category, safe(child.category))
                metadata = {**data, "vb_platform": platform, "vb_owner": safe(data.get("subreddit") or author),
                            "vb_post": safe(post_id), "vb_asset": safe(asset_id), "vb_key": key,
                            "vb_kind": kind, "vb_width": width, "vb_height": height, "extension": ext}
                if child.category in ("tiktok", "twitter"):
                    relative_path = (platform, metadata["vb_owner"],
                                     f"{metadata['vb_post']}_{metadata['vb_asset']}.{ext}")
                else:
                    relative_path = (platform, metadata["vb_owner"], metadata["vb_post"],
                                     safe(asset_id) + "." + ext)
                filename = os.path.join(self.root_directory, *relative_path)
                if os.path.commonpath((os.path.realpath(filename), self.root_directory)) != self.root_directory:
                    raise exception.AbortExtraction("Media directory contains an unsafe symbolic link")
                if kind in ("image", "video"):
                    self.summary["images" if kind == "image" else "videos"] += 1
                if self.inspect_mode:
                    if self.config("map-items", False) and child.category in ("twitter", "tiktok"):
                        if child.category == "twitter":
                            post_url = f"https://x.com/i/web/status/{post_id}"
                        else:
                            post_type = "photo" if kind == "image" else "video"
                            post_url = f"https://www.tiktok.com/@{author}/{post_type}/{post_id}"
                        print(PREFIX + json.dumps({"type": "item", "item": {
                            "id": post_id, "url": post_url, "kind": kind, "author": author}}), flush=True)
                    self.event("progress")
                    continue
                if verified_path := self.manifest.verified(
                        key, filename, width, height, child.category == "twitter"):
                    self.summary["existing"] += 1
                    self.summary["totalSize"] += os.path.getsize(verified_path)
                    self.event("progress")
                    continue
                self.asset_done = False
                yield Message.Directory, self.source_url, metadata
                yield Message.Url, target, metadata
                if not self.asset_done:
                    self.summary["failed"] += 1
                    self.event("progress")
                if self.limit_reached:
                    return
        finally:
            child.log.removeHandler(self.handler)

    def items(self):
        try:
            yield from self._walk(self.source_url)
            if self.extraction_error or self.summary["failed"]:
                raise exception.AbortExtraction("Collection is incomplete; retry the failed media or refresh authentication")
            self.summary["reason"] = "limit" if (self.limit_reached or self.options.get("since") or self.options.get("until")) else "exhausted"
        finally:
            self.summary["finishedAt"] = int(time.time() * 1000)
            self.event("complete")
            self.manifest.db.close()
