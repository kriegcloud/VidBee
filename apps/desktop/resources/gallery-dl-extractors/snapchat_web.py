"""Snapchat public-profile mapping and per-snap downloads for VidBee.

The logged-out profile page embeds everything the web app shows in
``__NEXT_DATA__``: the current 24h story, saved highlights, and the first page
of Spotlight posts. Captured 2026-10-24, the web client never fetches further
pages without a login, so the profile page is the whole public surface.

``/@user/stories`` maps the current story plus every saved highlight; adding
``?vidbee_snap=<file_id>`` narrows it to one snap for a single download.
``/@user/spotlights`` maps Spotlight posts; each post downloads through
gallery-dl's own ``/@user/spotlight/<id>`` extractor.
"""
from urllib.parse import parse_qs

from gallery_dl.extractor.common import Message
from gallery_dl.extractor.snapchat import SnapchatExtractor, USER_PATTERN

SNAP_PARAM = "vidbee_snap"


def _value(entry):
    """Snapchat wraps scalars as ``{"value": ...}``; tolerate both shapes."""
    if isinstance(entry, dict):
        return entry.get("value")
    return entry


class VidBeeSnapchatProfileMixin:
    root = "https://www.snapchat.com"

    def _profile(self, user):
        data = self._request_next_data(f"{self.root}/@{user}")
        info = (data.get("userProfile") or {}).get("publicProfileInfo") or {}
        return data, {
            "user": user,
            "user_title": info.get("title") or user,
            "avatar": info.get("profilePictureUrl") or "",
        }

    def _snap(self, story, snap, extract, extra):
        # Drop the sibling list: every snap would otherwise repeat it in -j output.
        story = {key: value for key, value in story.items() if key != "snapList"}
        url, data = extract(story, snap)
        data.update(extra)
        return url, data


class VidBeeSnapchatStoriesExtractor(VidBeeSnapchatProfileMixin, SnapchatExtractor):
    """Current story and saved highlights of a public profile."""
    subcategory = "vidbee-stories"
    pattern = USER_PATTERN + r"/(?:stories|highlights)/?(?:\?([^#]*))?(?:#.*)?$"
    example = "https://www.snapchat.com/@username/stories"

    def items(self):
        user = self.groups[0].lower()
        wanted = (parse_qs(self.groups[1] or "").get(SNAP_PARAM) or [None])[0]
        data, profile = self._profile(user)
        yield Message.Directory, "", profile

        stories = []
        if data.get("story"):
            stories.append(("story", data["story"]))
        for highlight in data.get("curatedHighlights") or ():
            stories.append(("highlight", highlight))

        for kind, story in stories:
            highlight_id = _value(story.get("highlightId")) or ""
            for num, snap in enumerate(story.get("snapList") or ()):
                try:
                    url, meta = self._snap(story, snap, self._extract_story_item, {
                        **profile,
                        "vidbee_category": "stories",
                        "vidbee_kind": kind,
                        "highlight_id": highlight_id,
                    })
                except Exception as exc:
                    self.log.traceback(exc)
                    self.log.error("%s: Failed to extract %s snap %d (%s: %s)",
                                   self.url, kind, num + 1, exc.__class__.__name__, exc)
                    continue
                if wanted and meta["file_id"] != wanted:
                    continue
                yield Message.Url, url, meta


class VidBeeSnapchatSpotlightsExtractor(VidBeeSnapchatProfileMixin, SnapchatExtractor):
    """Spotlight posts listed on a public profile."""
    subcategory = "vidbee-spotlights"
    pattern = USER_PATTERN + r"/spotlights/?(?:[?#].*)?$"
    example = "https://www.snapchat.com/@username/spotlights"

    def items(self):
        user = self.groups[0].lower()
        data, profile = self._profile(user)
        yield Message.Directory, "", profile

        metadata = data.get("spotlightStoryMetadata") or ()
        for index, spotlight in enumerate(data.get("spotlightHighlights") or ()):
            snaps = spotlight.get("snapList") or ()
            # Removed or private posts stay in the list as empty placeholders.
            if not snaps:
                continue
            video = (metadata[index] if index < len(metadata) else {}).get("videoMetadata") or {}
            for num, snap in enumerate(snaps):
                try:
                    url, meta = self._snap(spotlight, snap, self._extract_spotlight_item, {
                        **profile,
                        "vidbee_category": "spotlight",
                        "spotlight_id": _value(snap.get("snapId")) or "",
                        "upload_ms": int(video.get("uploadDateMs") or 0),
                        "description": video.get("description") or "",
                    })
                except Exception as exc:
                    self.log.traceback(exc)
                    self.log.error("%s: Failed to extract spotlight %d (%s: %s)",
                                   self.url, num + 1, exc.__class__.__name__, exc)
                    continue
                yield Message.Url, url, meta
