"""VidBee Instagram profile extraction using the browser's paginated web API.

Operation IDs verified against Instagram's Relay bundles on 2026-09-10.
Session tokens are read from the authenticated page and kept only in memory.
The bundled gallery-dl still handles cookies, media parsing, and downloads.
"""
import json
import re
import sys

from gallery_dl.extractor.instagram import (
    InstagramPostExtractor, InstagramPostsExtractor, InstagramReelsExtractor, InstagramStoriesExtractor,
    InstagramHighlightsExtractor, InstagramTaggedExtractor, InstagramGraphqlAPI, shortcode_from_id,
)


class InstagramWebMixin:
    _POSTS_QUERY = ("38154989454116081", "PolarisProfilePostsQuery")
    _POSTS_PAGE = ("39535953862670189", "PolarisProfilePostsTabContentQuery_connection")
    _REELS_QUERY = ("37945290971781723", "PolarisProfileReelsTabContentQuery")
    _REELS_PAGE = ("28170354102656082", "PolarisProfileReelsTabContentQuery_connection")
    _COUNT = 12

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

    def items(self):
        inspecting = self.config("vidbee-inspection", False)
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
                print("VIDBEE_MAP:" + json.dumps([3, "", reference], default=str),
                      file=sys.stderr, flush=True)
            yield message

    def _init(self):
        csrf = self.cookies.get("csrftoken", domain=".instagram.com")
        super()._init()
        if csrf:
            self.csrf_token = csrf
            self.cookies.set("csrftoken", csrf, domain=".instagram.com")
        self._web_body = None

    def _web_context(self):
        page = self.request(f"{self.root}/{self.item}/").text
        def module(name):
            match = re.search(r'"' + name + r'"\s*,\s*\[\]\s*,', page)
            if match:
                try:
                    return json.JSONDecoder().raw_decode(page[match.end():])[0]
                except ValueError:
                    pass
            return {}
        dtsg = module("DTSGInitialData").get("token", "")
        lsd = module("LSD").get("token", "")
        if not lsd:
            raise self.exc.AbortExtraction("Instagram web session is unavailable; check your cookies.")
        body = {
            "av": self.cookies.get("ds_user_id", domain=".instagram.com") or "0",
            "__user": "0", "__a": "1", "__d": "www", "__comet_req": "7",
            "fb_dtsg": dtsg, "lsd": lsd,
            "jazoest": "2" + str(sum(map(ord, dtsg))),
            "fb_api_caller_class": "RelayModern", "server_timestamps": "true",
        }
        site = module("SiteData")
        for key, field in (("__hs", "haste_session"), ("__hsi", "hsi"),
                           ("__rev", "client_revision"), ("__spin_r", "__spin_r"),
                           ("__spin_b", "__spin_b"), ("__spin_t", "__spin_t")):
            if site.get(field) is not None:
                body[key] = str(site[field])
        self._web_body = body

    def _web_query(self, operation, variables):
        if self._web_body is None:
            self._web_context()
        doc_id, name = operation
        response = self.request(f"{self.root}/graphql/query", method="POST", data={
            **self._web_body, "doc_id": doc_id, "fb_api_req_friendly_name": name,
            "variables": json.dumps(variables),
        }, headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": self.root, "Referer": f"{self.root}/{self.item}/",
            "X-CSRFToken": self.csrf_token, "X-IG-App-ID": "936619743392459",
            "X-FB-Friendly-Name": name, "X-FB-LSD": self._web_body["lsd"],
            "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin",
        }).json()
        data = response.get("data")
        if not isinstance(data, dict):
            raise self.exc.AbortExtraction("Instagram rejected the profile query; check cookies or try again later.")
        # Instagram can return nonfatal errors for unrelated location avatars.
        # Required collection, pagination, and media fields are validated below.
        return data

    def _web_pages(self, reels=False):
        uid = self.api.user_id(self.item) if reels else None
        saved = self._saved_mapping()
        cursor = saved.get("cursor") if saved.get("state") not in ("ready", "empty") else None
        known = {item["url"].rstrip("/").split("/")[-1] for item in saved.get("items", [])}
        incremental = saved.get("state") in ("ready", "empty") or saved.get("incremental", False)
        known_run = 0
        seen_cursors, seen_ids = set(), set()
        while True:
            if reels:
                variables = {
                    "data": {"include_feed_video": True, "page_size": self._COUNT, "target_user_id": uid},
                    "user_id" if cursor is None else "id": uid,
                    "__relay_internal__pv__PolarisShortDramaEnabledrelayprovider": False,
                }
                operation = self._REELS_QUERY if cursor is None else self._REELS_PAGE
            else:
                variables = {
                    "data": {"count": self._COUNT, "include_reel_media_seen_timestamp": True,
                             "include_relationship_info": True, "latest_besties_reel_media": True,
                             "latest_reel_media": True},
                    "username": self.item,
                    "__relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider": True,
                    "__relay_internal__pv__PolarisShortDramaEnabledrelayprovider": False,
                    "__relay_internal__pv__PolarisReelsRecoDebugOverlayEnabledrelayprovider": False,
                }
                operation = self._POSTS_QUERY if cursor is None else self._POSTS_PAGE
                if cursor is not None:
                    variables.update({"before": None, "last": None, "include_multi_captions": True})
            if cursor is not None:
                variables.update({"after": cursor, "first": self._COUNT})
            data = self._web_query(operation, variables)
            if reels:
                connection = (data.get("fetch__XDTUserDict") or {}).get("clips_connection")
            else:
                connection = data.get("xdt_api__v1__feed__user_timeline_graphql_connection")
            if not isinstance(connection, dict):
                raise self.exc.AbortExtraction("Instagram returned no profile collection; download is incomplete.")
            edges, page = connection.get("edges"), connection.get("page_info")
            if not isinstance(edges, list) or not isinstance(page, dict) or not isinstance(page.get("has_next_page"), bool):
                raise self.exc.AbortExtraction("Instagram returned invalid profile pagination; download is incomplete.")
            for edge in edges:
                post = (edge.get("node") or {})
                if reels:
                    post = post.get("media") or {}
                media_id = post.get("pk")
                if not media_id:
                    raise self.exc.AbortExtraction("Instagram returned unreadable media; download is incomplete.")
                if str(media_id) in seen_ids:
                    continue
                seen_ids.add(str(media_id))
                shortcode = post.get("code") or shortcode_from_id(str(media_id))
                if incremental and shortcode in known:
                    if not (post.get("pinned_for_users") or post.get("is_pinned")):
                        known_run += 1
                    if known_run >= self._COUNT:
                        return
                    continue
                known_run = 0
                if reels:
                    # The reels grid only contains thumbnails. Resolve the actual video.
                    items = self.api.media(shortcode_from_id(str(media_id)))
                    post = next(iter(items), None)
                    if not post:
                        raise self.exc.AbortExtraction("Instagram reel has no media details; download is incomplete.")
                location = post.get("location")
                if location and "short_name" not in location:
                    location["short_name"] = location.get("name") or "location"
                self._validate_media(post)
                post.pop("__typename", None)  # Web nodes use the REST media shape.
                yield post
            if not page["has_next_page"]:
                return
            cursor = page.get("end_cursor")
            if not isinstance(cursor, str) or not cursor or cursor in seen_cursors:
                raise self.exc.AbortExtraction("Instagram pagination did not advance; download is incomplete.")
            seen_cursors.add(cursor)
            if getattr(self, "config", lambda key, default=None: default)("vidbee-inspection", False):
                print("VIDBEE_MAP:" + json.dumps([2, {"vidbee_cursor": cursor}]), file=sys.stderr, flush=True)

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
        return self._web_pages()


class VidBeeInstagramReelsExtractor(InstagramWebMixin, InstagramReelsExtractor):
    pattern = r"(?:https?://)?(?:www\.)?instagram\.com/([^/?#]+)/reels/?(?:[?#]|$)"

    def posts(self):
        return self._web_pages(reels=True)


class VidBeeInstagramStoriesExtractor(InstagramWebMixin, InstagramStoriesExtractor):
    pattern = InstagramStoriesExtractor.pattern


class VidBeeInstagramHighlightsExtractor(InstagramWebMixin, InstagramHighlightsExtractor):
    pattern = InstagramHighlightsExtractor.pattern

    def _init(self):
        super()._init()
        self._rest_highlights_tray = self.api.highlights_tray
        self.api.highlights_tray = self._highlights_tray

    def _highlights_tray(self, user_id):
        try:
            tray = self._rest_highlights_tray(user_id)
        except self.exc.AbortExtraction as error:
            # Some accounts redirect this REST endpoint while the web tray works.
            if "HTTP redirect to home page" not in str(error):
                raise
            # Use the authenticated highlights query also used by Instaloader.
            data = InstagramGraphqlAPI(self)._call("7c16654f22c819fb63d1183034a5162f", {
                "user_id": user_id, "include_chaining": False, "include_reel": False,
                "include_suggested_users": False, "include_logged_out_extras": False,
                "include_highlight_reels": True,
            })
            connection = (data.get("user") or {}).get("edge_highlight_reels")
            if not isinstance(connection, dict) or not isinstance(connection.get("edges"), list):
                raise self.exc.AbortExtraction("Instagram returned no highlights collection; mapping is incomplete.")
            tray = [{**edge["node"], "id": "highlight:" + str(edge["node"]["id"]).removeprefix("highlight:")}
                    for edge in connection["edges"]]
        saved = self._saved_mapping()
        known = {item["url"].rstrip("/").split("/")[-1]: item
                 for item in saved.get("items", [])}
        self._highlight_versions = {}
        changed = []
        for highlight in tray:
            identifier = str(highlight["id"]).removeprefix("highlight:")
            # Only skip when Instagram provides both freshness and item-count evidence.
            modified, count = highlight.get("latest_reel_media"), highlight.get("media_count")
            version = f"{modified}:{count}" if modified is not None and count is not None else None
            if version:
                self._highlight_versions[identifier] = version
            previous = known.get(identifier, {})
            if not (version and (saved.get("state") in ("ready", "empty") or saved.get("incremental"))
                    and previous.get("sourceVersion") == version and previous.get("assetCount") == count):
                changed.append(highlight)
        return changed



class VidBeeInstagramTaggedExtractor(InstagramWebMixin, InstagramTaggedExtractor):
    pattern = InstagramTaggedExtractor.pattern

    def posts(self):
        saved = self._saved_mapping()
        known = {item["url"].rstrip("/").split("/")[-1] for item in saved.get("items", [])}
        known_run = 0
        for post in super().posts():
            shortcode = post.get("code") or post.get("shortcode")
            if saved.get("state") in ("ready", "empty") and shortcode in known:
                known_run += 1
                if known_run >= self._COUNT:
                    return
                continue
            known_run = 0
            yield post
