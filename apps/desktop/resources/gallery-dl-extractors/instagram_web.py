"""VidBee Instagram profile extraction on top of gallery-dl's Relay GraphQL API.

Verified against gallery-dl 1.33.0-dev (gdl-org/builds 2026.10.22). Upstream now
serves posts, reels, tagged posts, highlights, and stories through Instagram's
persisted Relay queries with automatic doc_id discovery, so VidBee only adds
mapping progress, saved-reference resume, incremental stops, and change
detection on top of it. Session tokens stay inside gallery-dl.
"""
import json
import sys

from gallery_dl.extractor.instagram import (
    InstagramPostExtractor, InstagramPostsExtractor, InstagramReelsExtractor, InstagramStoriesExtractor,
    InstagramHighlightsExtractor, InstagramTaggedExtractor, shortcode_from_id,
)

# Stop an incremental scan after this many consecutive already-mapped posts.
KNOWN_RUN_STOP = 12
HIGHLIGHT_CHUNK = 5
PINNED_KEYS = ("pinned_for_users", "is_pinned", "timeline_pinned_user_ids", "clips_tab_pinned_user_ids")


def emit_map(payload):
    print("VIDBEE_MAP:" + json.dumps(payload, default=str), file=sys.stderr, flush=True)


class InstagramWebMixin:
    def _saved_mapping(self):
        cached = getattr(self, "_saved_mapping_cache", None)
        if cached is not None:
            return cached
        config = getattr(self, "config", lambda key, default=None: default)
        filename = config("vidbee-known-profile")
        category = config("vidbee-inspection-category")
        saved = {}
        if filename:
            with open(filename, encoding="utf-8") as handle:
                profile = json.load(handle)
            saved = next((entry for entry in profile.get("categories", [])
                          if entry.get("category") == category), {})
        self._saved_mapping_cache = saved
        return saved

    def _inspecting(self):
        return bool(self.config("vidbee-inspection", False))

    def items(self):
        inspecting = self._inspecting()
        for message in super().items():
            if inspecting and message[0] == 3:
                metadata = message[2]
                version = getattr(self, "_highlight_versions", {}).get(str(metadata.get("post_id")))
                if version:
                    metadata["vidbee_source_version"] = version
                reference = {key: metadata[key] for key in (
                    "post_url", "post_id", "media_id", "type", "highlight_title", "description", "vidbee_source_version"
                ) if key in metadata}
                # Keep expiring CDN URLs and cookies out of the progress channel.
                emit_map([3, "", reference])
            yield message

    def _init(self):
        csrf = self.cookies.get("csrftoken", domain=".instagram.com")
        super()._init()
        if csrf:
            # Keep the browser's CSRF token instead of gallery-dl's generated one.
            self.csrf_token = csrf
            self.cookies.set("csrftoken", csrf, domain=".instagram.com")
        self._vidbee_resume_cursor = None
        self._vidbee_track_cursor = False
        self._vidbee_last_cursor = None

    # gallery-dl asks for the start cursor when the profile feed pagination
    # begins and reports every page cursor afterwards. Nested media lookups
    # paginate too, so the resume cursor is handed out exactly once.
    def _init_cursor(self):
        cursor = self._vidbee_resume_cursor
        if cursor:
            self._vidbee_resume_cursor = None
            return cursor
        return super()._init_cursor()

    def _update_cursor(self, cursor):
        if cursor and self._vidbee_track_cursor and cursor != self._vidbee_last_cursor and self._inspecting():
            self._vidbee_last_cursor = cursor
            emit_map([2, {"vidbee_cursor": cursor}])
        return super()._update_cursor(cursor)

    def _web_posts(self, nodes, resolve=None):
        """Yield media for profile feed nodes, honoring saved references."""
        saved = self._saved_mapping()
        finished = saved.get("state") in ("ready", "empty")
        incremental = finished or saved.get("incremental", False)
        self._vidbee_resume_cursor = None if finished else saved.get("cursor")
        self._vidbee_track_cursor = True
        known = {item["url"].rstrip("/").split("/")[-1] for item in saved.get("items", [])}
        known_run = 0
        seen_ids = set()
        for node in nodes:
            media_id = node.get("pk") or node.get("id")
            if not media_id:
                raise self.exc.AbortExtraction("Instagram returned unreadable media; mapping is incomplete.")
            media_id = str(media_id)
            if media_id in seen_ids:
                continue
            seen_ids.add(media_id)
            shortcode = node.get("code") or shortcode_from_id(media_id)
            if incremental and shortcode in known:
                if not any(node.get(key) for key in PINNED_KEYS):
                    known_run += 1
                if known_run >= KNOWN_RUN_STOP:
                    return
                continue
            known_run = 0
            post = node
            if resolve is not None:
                # Grid nodes omit video formats, dates, and carousel item IDs.
                post = next(iter(resolve(shortcode)), None)
                if not post:
                    raise self.exc.AbortExtraction("Instagram media details are unavailable; download is incomplete.")
            self._validate_media(post)
            yield post

    # Instagram's Relay bundle (checked 2026-10-22) declares these provided
    # variables for the profile tab queries. Omitting any of them makes the
    # server answer "missing_required_variable_value" with HTTP 200, which the
    # stock extractor reports as KeyError: 'data'.
    _TAB_PROVIDERS = {
        "__relay_internal__pv__PolarisShortDramaEnabledrelayprovider": False,
        "__relay_internal__pv__PolarisSEOIsCrawlerrelayprovider": False,
    }
    _POSTS_PROVIDERS = {
        "__relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider": True,
        "__relay_internal__pv__PolarisThreadsStyleCommentsEnabledrelayprovider": False,
        "__relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider": False,
    }

    def _user_feed(self):
        variables = {
            "after": None, "before": None,
            "data": {"count": 12, "include_reel_media_seen_timestamp": True, "include_relationship_info": True,
                     "latest_besties_reel_media": True, "latest_reel_media": True},
            "first": 12, "include_multi_captions": True, "last": None,
            "username": self.api.user(self.item)["username"],
            **self._TAB_PROVIDERS, **self._POSTS_PROVIDERS,
        }
        return self.api._pagination_graphql(
            "PolarisProfilePostsTabContentQuery_connection", variables,
            "xdt_api__v1__feed__user_timeline_graphql_connection")

    def _user_reels(self):
        user_id = str(self.api.user(self.item)["id"])
        variables = {
            "after": "",
            "data": {"include_feed_video": True, "page_size": 12, "target_user_id": user_id},
            "first": 12, "id": user_id,
            **self._TAB_PROVIDERS,
        }
        return self.api._pagination_graphql(
            "PolarisProfileReelsTabContentQuery_connection", variables, "fetch__XDTUserDict")

    def _user_tagged(self):
        variables = {
            "after": None, "before": None, "count": 12, "first": 12, "last": None,
            "user_id": str(self.api.user(self.item)["id"]),
            **self._TAB_PROVIDERS,
        }
        return self.api._pagination_graphql(
            "PolarisProfileTaggedTabContentQuery_connection", variables,
            "xdt_api__v1__usertags__user_id__feed_connection")

    def _validate_media(self, post):
        for media in post.get("carousel_media") or [post]:
            if not (media.get("image_versions2") or {}).get("candidates"):
                raise self.exc.AbortExtraction("Instagram media images are unavailable; download is incomplete.")
            if media.get("media_type") == 2 and not media.get("video_versions"):
                raise self.exc.AbortExtraction("Instagram video formats are unavailable; download is incomplete.")


class VidBeeInstagramPostExtractor(InstagramWebMixin, InstagramPostExtractor):
    # Individual saved references need the same session handling as profile scans.
    pattern = InstagramPostExtractor.pattern


class VidBeeInstagramPostsExtractor(InstagramWebMixin, InstagramPostsExtractor):
    # Keep /photos compatibility for downloads queued by earlier VidBee builds.
    pattern = r"(?:https?://)?(?:www\.)?instagram\.com/([^/?#]+)/(?:posts|photos)/?(?:[?#]|$)"

    def posts(self):
        return self._web_posts(self._user_feed())


class VidBeeInstagramReelsExtractor(InstagramWebMixin, InstagramReelsExtractor):
    pattern = r"(?:https?://)?(?:www\.)?instagram\.com/([^/?#]+)/reels/?(?:[?#]|$)"

    def posts(self):
        nodes = (reel.get("media") or {} for reel in self._user_reels())
        return self._web_posts(nodes, resolve=self.api.media)


class VidBeeInstagramStoriesExtractor(InstagramWebMixin, InstagramStoriesExtractor):
    pattern = InstagramStoriesExtractor.pattern


class VidBeeInstagramHighlightsExtractor(InstagramWebMixin, InstagramHighlightsExtractor):
    pattern = InstagramHighlightsExtractor.pattern

    def posts(self):
        tray = self.api.highlights_tray(self.item)
        saved = self._saved_mapping()
        known = {item["url"].rstrip("/").split("/")[-1]: item
                 for item in saved.get("items", [])}
        self._highlight_versions = {}
        reel_ids = []
        for highlight in tray:
            reel_id = str(highlight["id"])
            identifier = reel_id.removeprefix("highlight:")
            # Only skip when Instagram provides both freshness and item-count evidence.
            modified, count = highlight.get("latest_reel_media"), highlight.get("media_count")
            version = f"{modified}:{count}" if modified is not None and count is not None else None
            if version:
                self._highlight_versions[identifier] = version
            previous = known.get(identifier, {})
            if version and (saved.get("state") in ("ready", "empty") or saved.get("incremental")) \
                    and previous.get("sourceVersion") == version and previous.get("assetCount") == count:
                continue
            reel_ids.append(reel_id)
        for offset in range(0, len(reel_ids), HIGHLIGHT_CHUNK):
            yield from self.api.reels_media(reel_ids[offset:offset + HIGHLIGHT_CHUNK])


class VidBeeInstagramTaggedExtractor(InstagramWebMixin, InstagramTaggedExtractor):
    pattern = InstagramTaggedExtractor.pattern

    def posts(self):
        return self._web_posts(self._user_tagged(), resolve=self.api.media)
