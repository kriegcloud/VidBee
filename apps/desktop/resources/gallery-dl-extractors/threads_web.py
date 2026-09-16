"""Authenticated Threads media extraction for VidBee.

Relay operations and provider defaults were captured on 2026-09-16. Tokens
remain in memory; a rejected operation gets one bounded bundle refresh.
"""
import html
import json
import re
from urllib.parse import urlsplit

from gallery_dl.extractor.common import Extractor, Message

_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
_PROVIDER_DEFAULTS = {
    "__relay_internal__pv__BarcelonaCanSeeSponsoredContentrelayprovider": False,
    "__relay_internal__pv__BarcelonaGenAIRepliesEnabledrelayprovider": False,
    "__relay_internal__pv__BarcelonaHasBestOfThreadsrelayprovider": False,
    "__relay_internal__pv__BarcelonaHasCommunitiesrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasCommunityEmojiUpdateCardrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasCommunityEntityCardrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasCommunityPermalinkPivotsrelayprovider": False,
    "__relay_internal__pv__BarcelonaHasCommunityTopContributorsrelayprovider": False,
    "__relay_internal__pv__BarcelonaHasDearAlgoConsumptionrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasDearAlgoWebProductionrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasEventBadgerelayprovider": False,
    "__relay_internal__pv__BarcelonaHasGameScoreSharerelayprovider": True,
    "__relay_internal__pv__BarcelonaHasGhostPostEmojiActivationrelayprovider": False,
    "__relay_internal__pv__BarcelonaHasInsightsPermalinkUFIrelayprovider": False,
    "__relay_internal__pv__BarcelonaHasMessagingrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasMetaAiContentAttachmentsrelayprovider": False,
    "__relay_internal__pv__BarcelonaHasMusicrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasNewspaperLinkStylerelayprovider": False,
    "__relay_internal__pv__BarcelonaHasPermalinkIndentationrelayprovider": False,
    "__relay_internal__pv__BarcelonaHasPodcastTranscriptConsumptionrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasPodcastV2Consumptionrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasPodcastV2Productionrelayprovider": False,
    "__relay_internal__pv__BarcelonaHasPrivateRepliesDeprecationrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasProfileSelfReplyContextrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasPublicViewCountCardrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasScorecardCommunityrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasSportTeamAllegianceCardrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasViewerRepliedrelayprovider": True,
    "__relay_internal__pv__BarcelonaHasWebFaviconsrelayprovider": True,
    "__relay_internal__pv__BarcelonaIsCrawlerrelayprovider": False,
    "__relay_internal__pv__BarcelonaIsInternalUserrelayprovider": False,
    "__relay_internal__pv__BarcelonaIsLoggedInrelayprovider": True,
    "__relay_internal__pv__BarcelonaIsSearchDiscoveryEnabledrelayprovider": True,
    "__relay_internal__pv__BarcelonaMessagesHasLiveChatMessagingrelayprovider": False,
    "__relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider": True,
    "__relay_internal__pv__BarcelonaShouldFulfillLightboxQueryrelayprovider": True,
    "__relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider": True,
    "__relay_internal__pv__BarcelonaShouldShowFediverseM1Featuresrelayprovider": False,
}
_PROFILE_QUERY = ("38191639027147618", "BarcelonaProfileMediaTabDirectQuery")
_USER_QUERY = ("28437261742627184", "BarcelonaUsernameHovercardImplDirectQuery")
_POST_QUERY = ("28766445266306569", "BarcelonaPostPageStrongIdTargetQuery")
_PATTERN = (r"https?://(?:www\.)?threads\.(?:com|net)/@"
            r"([A-Za-z0-9_][A-Za-z0-9._]{0,29})")


def post_id(shortcode):
    value = 0
    for char in shortcode:
        value = value * 64 + _ALPHABET.index(char)
    return str(value)


def shortcode_from_id(value):
    value = int(value)
    result = ""
    while value:
        value, digit = divmod(value, 64)
        result = _ALPHABET[digit] + result
    return result or "A"


def module_data(page, name):
    match = re.search(r'"' + re.escape(name) + r'"\s*,\s*\[\]\s*,', page)
    if match:
        try:
            value = json.JSONDecoder().raw_decode(page[match.end():])[0]
            return value if isinstance(value, dict) else {}
        except ValueError:
            pass
    return {}


def bundle_operation(source, name):
    """Read Relay metadata without evaluating untrusted JavaScript."""
    match = re.search(r'\bid:\s*"(\d+)",\s*metadata:\s*\{[^{}]*\},\s*name:\s*"'
                      + re.escape(name) + r'"', source)
    if not match:
        # Newer bundles keep persisted IDs in a separate Relay operation module.
        match = re.search(r'__d\("' + re.escape(name) +
                          r'_threadsRelayOperation",\[\],\(function\([^)]*\)\{'
                          r'[A-Za-z_$][\w$]*\.exports="(\d+)"', source)
    if not match:
        return None
    flags = set(re.findall(r'__relay_internal__pv__[A-Za-z0-9_]+relayprovider', source))
    return match[1], flags


class ThreadsWebExtractor(Extractor):
    category = "threads"
    root = "https://www.threads.com"
    cookies_domain = ".threads.com"
    directory_fmt = ("Threads", "{username}", "{shortcode}")
    filename_fmt = "{id}_{num:>02}.{extension}"
    archive_fmt = "{id}_{num}"
    request_interval = 1.0

    def _cookie(self, name):
        for cookie in self.cookies:
            if (cookie.name == name and cookie.domain.lstrip(".") in
                    ("threads.com", "www.threads.com") and not cookie.is_expired()):
                return cookie.value
        return ""

    def _bootstrap(self):
        self.username = self.groups[0].lower()
        self.shortcode = self.groups[1] if self.subcategory == "post" else None
        self._refreshed = set()
        self._operations = {}
        self._providers = dict(_PROVIDER_DEFAULTS)
        self._csrf = self._cookie("csrftoken")
        if not self._csrf or not self._cookie("sessionid"):
            raise self.exc.AbortExtraction(
                "Log in to Threads and select its browser cookies or cookie file in Settings.")
        self._page = self.request(f"{self.root}/@{self.username}").text
        dtsg = module_data(self._page, "DTSGInitialData").get("token")
        lsd = module_data(self._page, "LSD").get("token")
        if not dtsg or not lsd:
            raise self.exc.AbortExtraction("Threads session expired; refresh your login cookies.")
        self._body = {
            "av": self._cookie("ds_user_id") or "0", "__user": "0", "__a": "1",
            "fb_dtsg": dtsg, "lsd": lsd,
            "fb_api_caller_class": "RelayModern", "server_timestamps": "true",
        }
        self.user_id = None
        if not self.shortcode:
            data = self._query(_USER_QUERY, {"username": self.username})
            user = data.get("user")
            if (not isinstance(user, dict) or
                    str(user.get("username", "")).lower() != self.username or
                    not str(user.get("pk", "")).isdigit()):
                raise self.exc.AbortExtraction("Threads profile is unavailable or its username changed.")
            self.user_id = str(user["pk"])

    def _refresh_operation(self, name):
        if name in self._refreshed:
            return False
        self._refreshed.add(name)
        # Only fetch HTTPS scripts on Meta's static CDN, never arbitrary page URLs.
        page = html.unescape(self._page).replace(r"\/", "/")
        scripts = dict.fromkeys(re.findall(r'https://[^\s"<>\\]+\.js(?:\?[^\s"<>\\]*)?', page))
        total = 0
        for index, url in enumerate(scripts):
            if index >= 40 or total >= 20 * 1024 * 1024:
                break
            host = urlsplit(url).hostname or ""
            if not (host == "cdninstagram.com" or host.endswith(".cdninstagram.com") or
                    host == "fbcdn.net" or host.endswith(".fbcdn.net")):
                continue
            response = self.request(url, fatal=False)
            if response.status_code != 200:
                continue
            source = response.text
            total += len(source)
            operation = bundle_operation(source, name)
            if operation:
                doc_id, flags = operation
                self._operations[name] = doc_id
                for flag in flags:
                    self._providers.setdefault(flag, False)
                return True
        return False

    def _query(self, operation, variables):
        doc_id, name = operation
        for attempt in range(2):
            response = self.request(f"{self.root}/graphql/query", method="POST", fatal=False,
                data={**self._body, "doc_id": self._operations.get(name, doc_id),
                      "fb_api_req_friendly_name": name,
                      "variables": json.dumps({**self._providers, **variables})},
                headers={"X-CSRFToken": self._csrf, "X-FB-LSD": self._body["lsd"],
                         "X-IG-App-ID": "238260118697367", "X-FB-Friendly-Name": name,
                         "Origin": self.root, "Referer": f"{self.root}/@{self.username}"})
            if response.status_code in (401, 403):
                raise self.exc.AbortExtraction("Threads rejected your session; refresh your login cookies.")
            if response.status_code == 429:
                raise self.exc.AbortExtraction("Threads rate limit reached; try again later.")
            try:
                payload = response.json()
            except ValueError:
                payload = {}
            data = payload.get("data") if isinstance(payload, dict) else None
            # Partial responses can hide missing media; never mark those complete.
            if (response.status_code == 200 and isinstance(data, dict) and
                    not payload.get("errors")):
                return data
            if attempt or not self._refresh_operation(name):
                break
        raise self.exc.AbortExtraction(
            "Threads rejected its media query; refresh cookies or update VidBee. Download is incomplete.")

    def _posts(self):
        if self.shortcode:
            post = self._query(_POST_QUERY, {"postID": post_id(self.shortcode)}).get("media")
            if not isinstance(post, dict):
                raise self.exc.AbortExtraction("Threads post is unavailable or has been deleted.")
            yield post
            return
        cursor = None
        seen_cursors, seen_ids = set(), set()
        while True:
            variables = {"userID": self.user_id, "first": 12}
            if cursor:
                variables["after"] = cursor
            connection = self._query(_PROFILE_QUERY, variables).get("mediaData")
            if not isinstance(connection, dict):
                raise self.exc.AbortExtraction("Threads returned no media collection; download is incomplete.")
            edges, page = connection.get("edges"), connection.get("page_info")
            if (not isinstance(edges, list) or not isinstance(page, dict) or
                    not isinstance(page.get("has_next_page"), bool)):
                raise self.exc.AbortExtraction("Threads returned invalid pagination; download is incomplete.")
            for edge in edges:
                node = edge.get("node") if isinstance(edge, dict) else None
                items = node.get("thread_items") if isinstance(node, dict) else None
                if not isinstance(items, list) or not items or not isinstance(items[0], dict):
                    raise self.exc.AbortExtraction("Threads returned an unreadable post; download is incomplete.")
                # A thread can contain replies; only the root post belongs to the Media tab.
                post = items[0].get("post")
                if not isinstance(post, dict) or not post.get("pk"):
                    raise self.exc.AbortExtraction("Threads returned unreadable media; download is incomplete.")
                owner = post.get("user") or {}
                if str(owner.get("pk")) != self.user_id:
                    continue
                info = post.get("text_post_app_info") or {}
                if info.get("reply_to_author") or info.get("reposted_post"):
                    continue
                media_id = str(post["pk"])
                if media_id not in seen_ids:
                    seen_ids.add(media_id)
                    yield post
            if not page["has_next_page"]:
                return
            cursor = page.get("end_cursor")
            if not isinstance(cursor, str) or not cursor or cursor in seen_cursors:
                raise self.exc.AbortExtraction("Threads pagination did not advance; download is incomplete.")
            seen_cursors.add(cursor)

    def _assets(self, post):
        carousel = post.get("carousel_media")
        if post.get("media_type") == 8 and not carousel:
            raise self.exc.AbortExtraction("Threads carousel is empty; download is incomplete.")
        media_items = carousel or [post]
        if not isinstance(media_items, list):
            raise self.exc.AbortExtraction("Threads carousel is unreadable; download is incomplete.")
        for media in media_items:
            if not isinstance(media, dict):
                raise self.exc.AbortExtraction("Threads media is unreadable; download is incomplete.")
            videos = media.get("video_versions")
            if media.get("media_type") == 2 and not videos:
                raise self.exc.AbortExtraction("Threads video formats are missing; download is incomplete.")
            candidates = videos or (media.get("image_versions2") or {}).get("candidates")
            if not isinstance(candidates, list) or not candidates:
                if media.get("media_type") == 19:
                    continue
                raise self.exc.AbortExtraction("Threads media has no downloadable formats; download is incomplete.")
            valid = [item for item in candidates if isinstance(item, dict) and item.get("url")]
            if not valid:
                raise self.exc.AbortExtraction("Threads media URLs are missing; download is incomplete.")
            def area(item):
                try:
                    return int(item.get("width", 0)) * int(item.get("height", 0))
                except (ValueError, TypeError):
                    return 0
            best = max(valid, key=area)
            url = best["url"]
            parsed = urlsplit(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise self.exc.AbortExtraction("Threads returned an invalid media URL.")
            extension = parsed.path.rpartition(".")[2].lower()
            if extension not in ("jpg", "jpeg", "png", "webp", "mp4", "webm"):
                extension = "mp4" if videos else "jpg"
            yield url, extension

    def items(self):
        self._bootstrap()
        count = 0
        for post in self._posts():
            media_id = str(post.get("pk") or "")
            if not media_id.isdigit():
                raise self.exc.AbortExtraction("Threads returned an invalid post ID.")
            shortcode = post.get("code") or shortcode_from_id(media_id)
            if not isinstance(shortcode, str) or not re.fullmatch(r"[A-Za-z0-9_-]{5,20}", shortcode):
                raise self.exc.AbortExtraction("Threads returned an invalid post code.")
            assets = list(self._assets(post))
            if not assets:
                continue
            metadata = {"id": media_id, "shortcode": shortcode, "username": self.username,
                        "count": len(assets)}
            yield Message.Directory, f"{self.root}/@{self.username}/post/{shortcode}", metadata
            for num, (url, extension) in enumerate(assets, 1):
                count += 1
                yield Message.Url, url, {**metadata, "num": num, "extension": extension}
        if not count:
            raise self.exc.AbortExtraction("No downloadable media found in this Threads post or Media tab.")


class VidBeeThreadsPostExtractor(ThreadsWebExtractor):
    subcategory = "post"
    pattern = _PATTERN + r"/post/([A-Za-z0-9_-]{5,20})/?(?:[?#]|$)"


class VidBeeThreadsProfileExtractor(ThreadsWebExtractor):
    subcategory = "profile"
    pattern = _PATTERN + r"(?:/media)?/?(?:[?#]|$)"
