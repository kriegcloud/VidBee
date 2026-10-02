from .common import InfoExtractor
from .zype import ZypeIE
from ..utils import ExtractorError, parse_iso8601, traverse_obj


class OfTVIE(InfoExtractor):
    _VALID_URL = r'https?://(?:www\.)?of\.tv/video/(?P<id>[0-9a-fA-F]{24})/?(?:$|[?#])'
    _TESTS = [{
        'url': 'https://of.tv/video/627d7d95b353db0001dadd1a',
        'md5': 'cb9cd5db3bb9ee0d32bfd7e373d6ef0a',
        'info_dict': {
            'id': '627d7d95b353db0001dadd1a',
            'ext': 'mp4',
            'title': 'E1: Jacky vs Eric',
            'thumbnail': r're:^https?://.*\.jpg',
            'average_rating': 0,
            'description': 'md5:dd16e3e2a8d27d922e7a989f85986853',
            'display_id': '',
            'duration': 1423,
            'timestamp': 1652391300,
            'upload_date': '20220512',
            'view_count': 0,
            'creator': 'This is Fire',
        },
    }]

    def _real_extract(self, url):
        video_id = self._match_id(url)
        webpage = self._download_webpage(url, video_id)
        info = next(ZypeIE.extract_from_webpage(self._downloader, url, webpage))
        info['_type'] = 'url_transparent'
        info['creator'] = self._search_regex(r'<a[^>]+class=\"creator-name\"[^>]+>([^<]+)', webpage, 'creator')
        return info


class OfTVPlaylistIE(InfoExtractor):
    _VALID_URL = r'https?://(?:www\.)?of\.tv/creators/(?P<id>[a-zA-Z0-9-]+)/?(?:$|[?#])'
    _TESTS = [{
        'url': 'https://of.tv/creators/this-is-fire/',
        'playlist_count': 8,
        'info_dict': {
            'id': 'this-is-fire',
        },
    }]

    def _real_extract(self, url):
        playlist_id = self._match_id(url)
        webpage = self._download_webpage(url, playlist_id)

        json_match = self._search_json(
            r'var\s*remaining_videos\s*=', webpage, 'oftv playlists', playlist_id, contains_pattern=r'\[.+\]')

        return self.playlist_from_matches(
            traverse_obj(json_match, (..., 'discovery_url')), playlist_id)


class OfTVChannelIE(InfoExtractor):
    _VALID_URL = r'https?://(?:www\.)?of\.tv/c/(?P<id>[a-zA-Z0-9_-]+)/?(?:$|[?#])'
    _TESTS = [{
        'url': 'https://of.tv/c/medusa',
        'playlist_mincount': 1,
        'info_dict': {
            'id': 'medusa',
            'title': 'Medusa',
        },
    }]

    def _real_extract(self, url):
        channel_id = self._match_id(url)
        data = self._download_json(f'https://api.of.tv/v0/pages/creators/{channel_id}', channel_id)['data']
        creator = data.get('creator') or {}
        if not creator:
            raise ExtractorError('OF.TV channel not found', expected=True)

        entries = [
            self.url_result(f'https://of.tv/v/{video["unique_id"]}', OfTVVideoIE, video['unique_id'], video.get('title'))
            for video in traverse_obj(data, ('creator_playlist', 'items')) or []
            if video.get('unique_id')
        ]
        return self.playlist_result(entries, channel_id, creator.get('channel_name'), creator.get('channel_description'))


class OfTVVideoIE(InfoExtractor):
    _VALID_URL = r'https?://(?:www\.)?of\.tv/(?:v|video)/(?P<id>[a-zA-Z0-9_-]+)(?:/embed)?/?(?:$|[?#])'
    _TESTS = [{
        'url': 'https://of.tv/v/KkMWY',
        'info_dict': {
            'id': 'KkMWY',
            'ext': 'mp4',
            'title': 'I Tried Reddit’s Favorite Teas',
        },
        'params': {'skip_download': True},
    }]

    def _real_extract(self, url):
        video_id = self._match_id(url)
        video = self._download_json(f'https://api.of.tv/v0/pages/videos/{video_id}', video_id)['data']['video']
        stream_url = video.get('video_src')
        if not stream_url:
            raise ExtractorError('OF.TV video has no stream', expected=True)

        return {
            'id': video['unique_id'],
            'title': video.get('title') or video.get('seo_title'),
            'description': video.get('description'),
            'thumbnail': video.get('thumbnail_url'),
            'duration': video.get('duration'),
            'timestamp': parse_iso8601(video.get('published_at')),
            'creator': traverse_obj(video, ('creator', 'channel_name')),
            'formats': self._extract_m3u8_formats(stream_url, video_id, 'mp4'),
        }
