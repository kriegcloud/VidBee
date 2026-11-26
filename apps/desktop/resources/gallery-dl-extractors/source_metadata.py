"""Record where each downloaded file came from, inside the file itself.

gallery-dl's built-in Python postprocessor calls ``tag`` after every finished
download. The page URL goes into XMP ``dc:source`` (plus EXIF ``UserComment``
for images and the QuickTime comment for MP4/MOV), the direct media URL into
XMP ``dc:relation``. Both URLs are also written to the freedesktop
``user.xdg.origin.url`` / ``user.xdg.referrer.url`` extended attributes that
browsers set and file managers such as Dolphin show as "Downloaded From".

Tagging is best effort: a missing exiftool or an unsupported format never
fails a download. The module defines no extractor classes, so gallery-dl's
``module-sources`` scan ignores it.
"""
import atexit
import os
import select
import shutil
import subprocess
import time

EXIF_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "tif", "tiff", "heic", "heif", "avif"}
QUICKTIME_EXTENSIONS = {"mp4", "m4v", "mov", "m4a"}
WRITABLE_EXTENSIONS = EXIF_EXTENSIONS | QUICKTIME_EXTENSIONS | {"gif"}
EXIFTOOL_FALLBACKS = ("/usr/bin/vendor_perl/exiftool",)
# Rewriting a large MP4 copies the whole file; never let a stuck tool stall a run.
COMMAND_TIMEOUT_SECONDS = 600

_exiftool = None
_exiftool_missing = False


def _http_url(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    if value.startswith(("https://", "http://")) and "\n" not in value and "\r" not in value:
        return value
    return None


def page_url(kwdict):
    """Prefer a per-post URL; fall back to the URL the extractor was given."""
    for key in ("vb_page_url", "post_url"):
        url = _http_url(kwdict.get(key))
        if url:
            return url
    return _http_url(getattr(kwdict.get("_extr"), "url", None))


def media_url(kwdict):
    return _http_url(kwdict.get("_url"))


def _resolve_exiftool():
    override = os.environ.get("VIDBEE_EXIFTOOL", "").strip()
    if override:
        return override if os.access(override, os.X_OK) else None
    found = shutil.which("exiftool")
    if found:
        return found
    for candidate in EXIFTOOL_FALLBACKS:
        if os.access(candidate, os.X_OK):
            return candidate
    return None


class _ExifTool:
    """One long-lived exiftool process instead of a Perl start per file."""

    def __init__(self, executable):
        self.sequence = 0
        self.process = subprocess.Popen(
            [executable, "-stay_open", "True", "-@", "-"], bufsize=0,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    def run(self, args):
        """Run one command; ``-q`` hides a bare {ready}, so commands are numbered."""
        if self.process.poll() is not None:
            return False
        self.sequence += 1
        marker = b"{ready%d}" % self.sequence
        output = b""
        deadline = time.monotonic() + COMMAND_TIMEOUT_SECONDS
        descriptor = self.process.stdout.fileno()
        try:
            self.process.stdin.write(("\n".join(args) + f"\n-execute{self.sequence}\n").encode("utf-8"))
            while marker not in output:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not select.select([descriptor], [], [], remaining)[0]:
                    self.process.kill()
                    return False
                chunk = os.read(descriptor, 4096)
                if not chunk:
                    return False
                output = output[-64:] + chunk
            return True
        except OSError:
            return False

    def close(self):
        if self.process.poll() is not None:
            return
        try:
            self.process.stdin.write(b"-stay_open\nFalse\n")
            self.process.stdin.close()
            self.process.wait(timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            self.process.kill()


def _tool():
    global _exiftool, _exiftool_missing
    if _exiftool is None and not _exiftool_missing:
        executable = _resolve_exiftool()
        if executable is None:
            _exiftool_missing = True
        else:
            try:
                _exiftool = _ExifTool(executable)
                atexit.register(_exiftool.close)
            except OSError:
                _exiftool_missing = True
    return _exiftool


def exiftool_args(path, page, media):
    """Build one exiftool command that embeds the source URLs into ``path``."""
    extension = os.path.splitext(path)[1][1:].lower()
    if extension not in WRITABLE_EXTENSIONS or "\n" in path or "\r" in path:
        return None
    source = page or media
    args = ["-q", "-q", "-m", "-P", "-overwrite_original", "-api", "LargeFileSupport=1",
            f"-XMP-dc:Source={source}"]
    if media and media != source:
        args.append(f"-XMP-dc:Relation={media}")
    if extension in EXIF_EXTENSIONS:
        args.append(f"-EXIF:UserComment={source}")
    if extension in QUICKTIME_EXTENSIONS:
        args.append(f"-ItemList:Comment={source}")
    args.append(path)
    return args


def write_xattrs(path, page, media):
    if not hasattr(os, "setxattr"):
        return
    referrer = page if page and page != media else None
    for name, value in (("user.xdg.origin.url", media or page), ("user.xdg.referrer.url", referrer)):
        if value:
            try:
                os.setxattr(path, name, value.encode("utf-8"))
            except OSError:
                return


def tag_file(path, page, media=None):
    """Embed ``page``/``media`` in the file at ``path``; never raises."""
    page, media = _http_url(page), _http_url(media)
    if not (page or media) or not os.path.isfile(path):
        return
    args = exiftool_args(path, page, media)
    tool = _tool() if args else None
    if tool is not None:
        tool.run(args)
    write_xattrs(path, page, media)


def tag(kwdict):
    """gallery-dl ``python`` postprocessor entry point for the ``after`` event."""
    path = kwdict.get("_path")  # a PathfmtProxy; str() gives the final path
    if path is not None:
        tag_file(str(path), page_url(kwdict), media_url(kwdict))
