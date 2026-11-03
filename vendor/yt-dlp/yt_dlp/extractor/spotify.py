import re

from .common import InfoExtractor
from ..utils import (
    ExtractorError,
    clean_html,
    determine_ext,
    float_or_none,
    parse_duration,
    unified_timestamp,
    url_or_none,
)
from ..utils.traversal import traverse_obj


class SpotifyEpisodeIE(InfoExtractor):
    IE_DESC = 'Spotify podcast episodes via public audio or publisher RSS'
    _VALID_URL = r'https?://open\.spotify\.com/(?:embed/)?(?:intl-[\w-]+/)?episode/(?P<id>[a-zA-Z0-9]{22})(?:[/?#]|$)'

    @staticmethod
    def _normalize_title(title):
        return re.sub(r'\W+', ' ', title or '').strip().casefold()

    def _rss_audio(self, entity, episode_id):
        series = entity.get('subtitle')
        title = entity.get('title') or entity.get('name')
        duration = float_or_none(entity.get('duration'), scale=1000)
        timestamp = unified_timestamp(traverse_obj(entity, ('releaseDate', 'isoString')))
        if not series or not title or duration is None or timestamp is None:
            return None
        search = self._download_json(
            'https://itunes.apple.com/search', episode_id,
            note='Finding publisher podcast RSS feed', fatal=False,
            query={'term': series, 'entity': 'podcast', 'limit': 10}) or {}
        feeds = set()
        matches = {}
        for podcast in search.get('results', []):
            if self._normalize_title(podcast.get('collectionName')) != self._normalize_title(series):
                continue
            feed_url = url_or_none(podcast.get('feedUrl'))
            if not feed_url or feed_url in feeds:
                continue
            feeds.add(feed_url)
            feed = self._download_xml(
                feed_url, episode_id, note='Checking publisher RSS episode', fatal=False)
            if feed is None:
                continue
            channel = feed.find('channel')
            if channel is None or self._normalize_title(channel.findtext('title')) != self._normalize_title(series):
                continue
            for item in channel.findall('item'):
                if self._normalize_title(item.findtext('title')) != self._normalize_title(title):
                    continue
                item_timestamp = unified_timestamp(item.findtext('pubDate'))
                item_duration = parse_duration(item.findtext('{http://www.itunes.com/dtds/podcast-1.0.dtd}duration'))
                # Require independent date and duration agreement, and reject ambiguous matches.
                if item_timestamp is None or abs(item_timestamp - timestamp) > 86400:
                    continue
                if item_duration is None or abs(item_duration - duration) > 5:
                    continue
                for enclosure in item.findall('enclosure'):
                    media_url = url_or_none(enclosure.get('url'))
                    if media_url and enclosure.get('type', '').startswith('audio/'):
                        matches[media_url] = clean_html(item.findtext('description'))
        if len(matches) == 1:
            return next(iter(matches.items()))
        return None

    def _real_extract(self, url):
        episode_id = self._match_id(url)
        webpage = self._download_webpage(
            f'https://open.spotify.com/embed/episode/{episode_id}', episode_id)
        data = self._search_nextjs_data(webpage, episode_id)['props']['pageProps']['state']['data']
        entity = data.get('entity') or {}
        if entity.get('id') != episode_id or entity.get('type') != 'episode':
            raise ExtractorError('Spotify returned a different podcast episode', expected=True)
        audio = data.get('defaultAudioFileObject') or {}
        media_url = url_or_none(audio.get('passthroughUrl')) if audio.get('passthrough') == 'ALLOWED' else None
        description = None
        if not media_url:
            rss_audio = self._rss_audio(entity, episode_id)
            if rss_audio:
                media_url, description = rss_audio
        if not media_url:
            raise ExtractorError(
                'No public full-length audio found for this Spotify episode. '
                'Try the publisher\'s RSS feed or episode page; Spotify previews and encrypted streams are not downloads.',
                expected=True)
        return {
            'id': episode_id,
            'title': entity.get('title') or entity.get('name'),
            'series': entity.get('subtitle'),
            'url': media_url,
            'ext': determine_ext(media_url, 'mp3'),
            'vcodec': 'none',
            'duration': float_or_none(entity.get('duration'), scale=1000),
            'timestamp': unified_timestamp(traverse_obj(entity, ('releaseDate', 'isoString'))),
            'thumbnail': traverse_obj(entity, ('relatedEntityCoverArt', 0, 'url')),
            'description': description,
        }
