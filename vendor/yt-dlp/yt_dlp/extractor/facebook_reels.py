import json
import re

from .common import InfoExtractor
from .facebook import FacebookReelIE
from ..utils import ExtractorError, float_or_none, traverse_obj, url_or_none, urlencode_postdata


class FacebookReelsIE(InfoExtractor):
    IE_NAME = 'facebook:reels'
    _VALID_URL = (
        r'(?i:https?://(?:(?:www|m|mbasic|web)\.)?facebook\.com)/'
        r'(?!(?:groups|pages|share|reel|watch)/)(?P<id>[A-Za-z0-9][A-Za-z0-9.]*)/reels/?(?:[?#]|$)'
    )
    _TESTS = [{
        'url': 'https://www.facebook.com/makenzeebush/reels',
        'only_matching': True,
    }, {
        'url': 'https://m.facebook.com/123/reels/?sk=reels',
        'only_matching': True,
    }]
    _ROOT = 'https://www.facebook.com'
    # From Facebook's public Relay operation bundle, verified 2026-09-10.
    _PAGINATION_QUERY = 'ProfileCometAppCollectionReelsRendererPaginationQuery'
    _PAGINATION_DOC_ID = '28401661769429506'
    _PAGE_SIZE = 10

    @staticmethod
    def _find_collection(data):
        pending = [data]
        while pending:
            node = pending.pop()
            if isinstance(node, dict):
                if isinstance(node.get('aggregated_fb_shorts'), dict):
                    return node
                pending.extend(node.values())
            elif isinstance(node, list):
                pending.extend(node)
        return None

    def _collection_from_webpage(self, webpage, profile):
        for raw in re.findall(r'<script\b[^>]*>\s*(\{.*?)</script>', webpage, re.DOTALL):
            if '"aggregated_fb_shorts"' not in raw:
                continue
            try:
                collection = self._find_collection(json.loads(raw))
            except json.JSONDecodeError:
                continue
            if collection is not None:
                return collection
        raise ExtractorError(
            'Unable to read this Facebook reels collection. It may be private or unavailable; '
            'check your Facebook cookies and profile access.', expected=True, video_id=profile)

    def _module_data(self, webpage, name, profile):
        return self._search_json(
            rf'"{re.escape(name)}"\s*,\s*\[\]\s*,', webpage, name, profile, default={})

    def _pagination_context(self, webpage, profile):
        dtsg = self._module_data(webpage, 'DTSGInitialData', profile).get('token', '')
        lsd = self._module_data(webpage, 'LSD', profile).get('token', '')
        site = self._module_data(webpage, 'SiteData', profile)
        user = self._module_data(webpage, 'CurrentUserInitialData', profile).get('USER_ID', '0')
        if not lsd:
            raise ExtractorError('Facebook pagination session is missing; refresh your cookies.', expected=True)
        # Request tokens and Relay feature flags stay in memory, never in playlist entries.
        body = {
            '__a': '1', '__comet_req': '15', '__req': '1', 'dpr': '1', '__ccg': 'EXCELLENT',
            '__user': user, 'av': user, 'fb_dtsg': dtsg, 'lsd': lsd,
            'jazoest': '2' + str(sum(map(ord, dtsg))),
            'fb_api_caller_class': 'RelayModern',
            'fb_api_req_friendly_name': self._PAGINATION_QUERY,
            'doc_id': self._PAGINATION_DOC_ID,
            'server_timestamps': 'true',
        }
        for key, field in (('__hs', 'haste_session'), ('__hsi', 'hsi'), ('__rev', 'client_revision'),
                           ('__spin_r', '__spin_r'), ('__spin_b', '__spin_b'), ('__spin_t', '__spin_t')):
            if site.get(field) is not None:
                body[key] = str(site[field])
        variables = {
            key: json.loads(value) for key, value in re.findall(
                r'"(__relay_internal__pv__[^"]+)":(true|false|\d+)', webpage)
        }
        variables.update({
            'count': self._PAGE_SIZE, 'renderLocation': None, 'scale': 1, 'useDefaultActor': False,
        })
        return body, variables

    def _download_reels_page(self, profile, collection_id, cursor, context, page):
        body, variables = context
        response = self._download_webpage(
            f'{self._ROOT}/api/graphql', profile, note=f'Downloading reels page {page}',
            data=urlencode_postdata({
                **body, 'variables': json.dumps({**variables, 'id': collection_id, 'cursor': cursor}),
            }), headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': self._ROOT, 'Referer': f'{self._ROOT}/{profile}/reels',
                'X-FB-Friendly-Name': self._PAGINATION_QUERY, 'X-FB-LSD': body['lsd'],
                'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin',
            })
        collection = None
        # Relay streams a main payload followed by deferred metadata as newline-delimited JSON.
        for line in response.splitlines():
            if not line.strip():
                continue
            data = self._parse_json(re.sub(r'^for\s*\(;;\);\s*', '', line), profile)
            if data.get('error') or data.get('errors'):
                raise ExtractorError(
                    'Facebook rejected reels pagination; refresh your cookies or try again later. '
                    'The playlist is incomplete.', expected=True)
            collection = collection or self._find_collection(data)
        if collection is None:
            raise ExtractorError('Facebook returned no reels page; the playlist is incomplete.', expected=True)
        return collection

    def _entries(self, collection, webpage, profile):
        seen_ids, seen_cursors = set(), set()
        context = None
        collection_id = collection.get('id')
        page = 1
        while True:
            connection = collection['aggregated_fb_shorts']
            edges, page_info = connection.get('edges'), connection.get('page_info')
            if not isinstance(edges, list) or not isinstance(page_info, dict):
                raise ExtractorError('Facebook returned a malformed reels page.', expected=True)
            has_next = page_info.get('has_next_page')
            if not isinstance(has_next, bool):
                raise ExtractorError('Facebook reels pagination status is missing.', expected=True)
            for edge in edges:
                story = traverse_obj(edge, ('profile_reel_node', 'node', {dict})) or {}
                video = traverse_obj(story, ('attachments', ..., 'media', {dict}), get_all=False) or {}
                video_id = traverse_obj(video, ('id', {str})) or traverse_obj(story, ('video', 'id', {str}))
                if not video_id or not video_id.isdecimal():
                    raise ExtractorError('Facebook returned an unreadable reel; the playlist is incomplete.', expected=True)
                if video_id in seen_ids:
                    continue
                seen_ids.add(video_id)
                yield self.url_result(
                    f'{self._ROOT}/reel/{video_id}', FacebookReelIE, video_id,
                    video_title=traverse_obj(story, ('message', 'text', {str})) or f'Facebook reel {video_id}',
                    duration=float_or_none(video.get('playable_duration_in_ms'), 1000)
                    or float_or_none(video.get('length_in_second')),
                    thumbnail=traverse_obj(video, ('thumbnailImage', 'uri', {url_or_none})),
                    uploader=traverse_obj(video, ('owner', 'name', {str})),
                    uploader_id=traverse_obj(video, ('owner', 'id', {str})))
            if not has_next:
                return
            cursor = page_info.get('end_cursor')
            if not isinstance(cursor, str) or not cursor or cursor in seen_cursors or not collection_id:
                raise ExtractorError('Facebook reels pagination did not advance; the playlist is incomplete.', expected=True)
            seen_cursors.add(cursor)
            context = context or self._pagination_context(webpage, profile)
            page += 1
            self._sleep(1, profile)
            collection = self._download_reels_page(profile, collection_id, cursor, context, page)

    def _real_extract(self, url):
        profile = self._match_id(url)
        webpage = self._download_webpage(f'{self._ROOT}/{profile}/reels', profile)
        collection = self._collection_from_webpage(webpage, profile)
        # Materialize before returning: --ignore-errors must not disguise a failed page as a complete list.
        entries = list(self._entries(collection, webpage, profile))
        return self.playlist_result(entries, profile, f'{profile} - Reels')
