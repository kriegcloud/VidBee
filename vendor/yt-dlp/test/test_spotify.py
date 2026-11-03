import json
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

from yt_dlp import YoutubeDL
from yt_dlp.extractor.spotify import SpotifyEpisodeIE
from yt_dlp.utils import ExtractorError


EPISODE_ID = '31R6YzywzUp6KkRojgN33T'
URL = f'https://open.spotify.com/episode/{EPISODE_ID}'
ENTITY = {
    'id': EPISODE_ID, 'type': 'episode', 'title': 'Episode title',
    'subtitle': 'Example Podcast', 'duration': 3180019,
    'releaseDate': {'isoString': '2026-03-21T13:57:00Z'},
}
FEED = '''<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>Example Podcast</title><item><title>Episode title</title>
<pubDate>Sat, 21 Mar 2026 13:57:06 GMT</pubDate><itunes:duration>00:53:00</itunes:duration>
<enclosure url="https://example.org/full.mp3" type="audio/mpeg"/>
</item></channel></rss>'''


class TestSpotifyEpisode(unittest.TestCase):
    def setUp(self):
        self.ydl = YoutubeDL({'quiet': True, 'no_warnings': True})
        self.addCleanup(self.ydl.close)
        self.ie = SpotifyEpisodeIE(self.ydl)

    def extract(self, audio, entity=None):
        data = {'props': {'pageProps': {'state': {'data': {
            'entity': entity or ENTITY, 'defaultAudioFileObject': audio,
        }}}}}
        html = '<script id="__NEXT_DATA__" type="application/json">' + json.dumps(data) + '</script>'
        with patch.object(self.ie, '_download_webpage', return_value=html):
            return self.ie._real_extract(URL + '?si=tracking')

    def test_matching_and_dispatch(self):
        for url in (URL, URL + '?si=tracking', URL.replace('/episode/', '/embed/episode/'),
                    URL.replace('/episode/', '/intl-de/episode/')):
            self.assertTrue(self.ie.suitable(url))
        for url in (URL + 'extra', URL.replace('spotify.com', 'spotify.com.example.org'),
                    URL.replace('/episode/', '/track/')):
            self.assertFalse(self.ie.suitable(url))
        self.assertEqual(next(ie for ie in self.ydl._ies.values() if ie.suitable(URL)).ie_key(), 'SpotifyEpisode')

    def test_passthrough(self):
        with patch.object(self.ie, '_rss_audio') as rss:
            result = self.extract({'passthrough': 'ALLOWED', 'passthroughUrl': 'https://example.org/full.mp3'})
        rss.assert_not_called()
        self.assertEqual(result['url'], 'https://example.org/full.mp3')
        self.assertEqual(result['vcodec'], 'none')

    def test_encrypted_audio_and_preview_are_not_downloads(self):
        with patch.object(self.ie, '_rss_audio', return_value=None):
            with self.assertRaisesRegex(ExtractorError, 'No public full-length audio'):
                self.extract({'format': 'MP4_128_CBCS', 'url': ['https://example.org/encrypted'],
                              'passthrough': 'NONE'}, {**ENTITY, 'audioPreview': {'url': 'https://example.org/preview.mp3'}})

    def rss(self, feed):
        with (patch.object(self.ie, '_download_json', return_value={'results': [{
                'collectionName': 'Example Podcast', 'feedUrl': 'https://example.org/rss'}]}),
              patch.object(self.ie, '_download_xml', return_value=ET.fromstring(feed))):
            return self.ie._rss_audio(ENTITY, EPISODE_ID)

    def test_rss_match(self):
        self.assertEqual(self.rss(FEED)[0], 'https://example.org/full.mp3')

    def test_rss_rejects_wrong_date_duration_title_or_show(self):
        for old, new in [('2026', '2025'), ('00:53:00', '00:01:00'),
                         ('Episode title', 'Another episode'), ('Example Podcast', 'Other Podcast')]:
            with self.subTest(field=old):
                self.assertIsNone(self.rss(FEED.replace(old, new)))

    def test_rss_rejects_ambiguous_enclosures(self):
        self.assertIsNone(self.rss(FEED.replace('</item>',
            '<enclosure url="https://example.org/other.mp3" type="audio/mpeg"/></item>')))

    def test_wrong_episode(self):
        with self.assertRaisesRegex(ExtractorError, 'different podcast episode'):
            self.extract({}, {**ENTITY, 'id': 'wrong'})
