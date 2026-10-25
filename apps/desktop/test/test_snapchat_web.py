"""Run with Python and gallery-dl 1.32.11 installed."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'resources/gallery-dl-extractors'))
from gallery_dl.extractor.common import Message
from snapchat_web import VidBeeSnapchatSpotlightsExtractor, VidBeeSnapchatStoriesExtractor


def snap(file_id, video=False, snap_id='', ts='1730502385'):
    return {'snapIndex': 0, 'snapId': {'value': snap_id}, 'snapMediaType': 1 if video else 0,
            'snapUrls': {'mediaUrl': f'https://cf-st.sc-cdn.net/d/{file_id}?mo=sig'},
            'timestampInSec': {'value': ts}}


def story(snaps, highlight_id=None, title=''):
    return {'storyType': 3, 'snapList': snaps, 'storyId': {'value': ''},
            'storyTitle': {'value': title},
            'highlightId': {'value': highlight_id} if highlight_id else None}


PROFILE = {
    'userProfile': {'publicProfileInfo': {'title': 'Fixture', 'profilePictureUrl': 'https://x/a.jpg'}},
    'story': story([snap('CurrentAAAA1.400', snap_id='CurrentStorySnapIdValue01')]),
    'curatedHighlights': [story([snap('HighAAAAAA1.400'), snap('HighAAAAAA2.27', True)], 'hl-1', 'trip')],
    'spotlightHighlights': [
        {'storyType': 0, 'snapList': []},
        {'storyType': 15, 'snapList': [snap('SpotAAAAAA1.27', True, 'W7_SpotlightIdentifier0000000000')]},
    ],
    'spotlightStoryMetadata': [
        {'videoMetadata': {'uploadDateMs': '0'}},
        {'videoMetadata': {'uploadDateMs': '1778605232113', 'description': 'hi'}},
    ],
}


def urls(extractor):
    with patch.object(type(extractor), '_request_next_data', return_value=PROFILE):
        return [(url, meta) for kind, url, meta in
                ((message[0], message[1], message[2] if len(message) > 2 else None)
                 for message in extractor.items()) if kind == Message.Url]


class TestSnapchatWeb(unittest.TestCase):
    def test_patterns(self):
        self.assertIsNotNone(VidBeeSnapchatStoriesExtractor.from_url('https://www.snapchat.com/@user/stories'))
        self.assertIsNotNone(VidBeeSnapchatStoriesExtractor.from_url(
            'https://www.snapchat.com/@user/stories?vidbee_snap=HighAAAAAA1.400'))
        self.assertIsNotNone(VidBeeSnapchatSpotlightsExtractor.from_url('https://snapchat.com/add/user/spotlights'))
        self.assertIsNone(VidBeeSnapchatStoriesExtractor.from_url('https://www.snapchat.com/@user'))
        self.assertIsNone(VidBeeSnapchatSpotlightsExtractor.from_url(
            'https://www.snapchat.com/@user/spotlight/W7_SpotlightIdentifier0000000000'))

    def test_stories_cover_current_story_and_highlights(self):
        found = urls(VidBeeSnapchatStoriesExtractor.from_url('https://www.snapchat.com/@User/stories'))
        self.assertEqual([meta['file_id'] for _, meta in found],
                         ['CurrentAAAA1.400', 'HighAAAAAA1.400', 'HighAAAAAA2.27'])
        self.assertEqual([meta['vidbee_kind'] for _, meta in found], ['story', 'highlight', 'highlight'])
        self.assertEqual(found[1][1]['highlight_id'], 'hl-1')
        self.assertEqual(found[2][1]['extension'], 'mp4')
        self.assertTrue(all(meta['user'] == 'user' and 'snapList' not in meta for _, meta in found))

    def test_story_snap_param_narrows_to_one_snap(self):
        found = urls(VidBeeSnapchatStoriesExtractor.from_url(
            'https://www.snapchat.com/@user/stories?vidbee_snap=HighAAAAAA2.27'))
        self.assertEqual([meta['file_id'] for _, meta in found], ['HighAAAAAA2.27'])

    def test_spotlights_skip_placeholders_and_carry_upload_time(self):
        found = urls(VidBeeSnapchatSpotlightsExtractor.from_url('https://www.snapchat.com/@user/spotlights'))
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0][1]['spotlight_id'], 'W7_SpotlightIdentifier0000000000')
        self.assertEqual(found[0][1]['upload_ms'], 1778605232113)


if __name__ == '__main__':
    unittest.main()
