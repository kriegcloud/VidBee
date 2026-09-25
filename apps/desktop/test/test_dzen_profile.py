"""Offline regression tests for the bundled Dzen profile extractor."""
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'vendor/yt-dlp'))
from yt_dlp.extractor.yandexvideo import ZenYandexChannelIE, ZenYandexIE
from yt_dlp.utils import ExtractorError


def video(id, query=''):
    return {'id': id, 'title': f'Video {id}', 'link': f'https://dzen.ru/video/watch/{id}{query}'}


def feed(items, cursor=None):
    data = {'items': items}
    if cursor is not None:
        data['more'] = {'link': f'https://dzen.ru/api/feed?next_page_id={cursor}'}
    return data


class TestDzenProfile(unittest.TestCase):
    def extractor(self, pages=()):
        ie = ZenYandexChannelIE()
        ie._download_json = Mock(side_effect=pages)
        return ie

    def test_paginated_longs_shorts_and_pinned_duplicates(self):
        first = feed([
            {'tab': 'longs', 'items': [video('aaa'), video('bbb')]},
            {'tab': 'shorts', 'items': [video('ccc')]},
            {'tab': 'articles', 'items': [{'link': 'https://dzen.ru/a/article'}]},
        ], 'page2')
        ie = self.extractor([feed([video('aaa', '?from=pinned'), video('ddd')])])
        entries = list(ie._entries(first, 'channel'))
        self.assertEqual([entry['id'] for entry in entries], ['aaa', 'bbb', 'ccc', 'ddd'])
        self.assertTrue(all(entry['ie_key'] == 'ZenYandex' for entry in entries))
        ie._download_json.assert_called_once()

    def test_real_short_url_selects_video_not_channel(self):
        url = 'https://dzen.ru/shorts/637e48d74a40eb5b183e3ce4'
        self.assertTrue(ZenYandexIE.suitable(url))
        self.assertFalse(ZenYandexChannelIE.suitable(url))
        ie = ZenYandexIE()
        ie._fetch_ssr_data = Mock(return_value=('637e48d74a40eb5b183e3ce4', {
            'videoMetaResponse': {'title': 'Short fixture', 'video': {
                'duration': 15, 'mp4Streams': [{'url': 'https://example.com/short.mp4?ct=0&type=1'}],
            }},
        }))
        result = ie._real_extract(url)
        ie._fetch_ssr_data.assert_called_once_with(
            'https://dzen.ru/video/watch/637e48d74a40eb5b183e3ce4', '637e48d74a40eb5b183e3ce4')
        self.assertEqual(result['duration'], 15)
        self.assertEqual(result['formats'][0]['ext'], 'mp4')

    def test_short_links_are_kept_in_profile_and_deduplicated_against_watch(self):
        item = {'link': 'https://dzen.ru/shorts/637e48d74a40eb5b183e3ce4', 'title': 'Short'}
        shorts = list(self.extractor()._entries(feed([{'tab': 'shorts', 'items': [item]}]), 'channel'))
        self.assertEqual([entry['url'] for entry in shorts], [item['link']])
        entries = list(self.extractor()._entries(feed([
            {'tab': 'shorts', 'items': [item]}, video('637e48d74a40eb5b183e3ce4'),
        ]), 'channel'))
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]['id'], '637e48d74a40eb5b183e3ce4')
        self.assertEqual(entries[0]['ie_key'], 'ZenYandex')

    def test_cycle_is_not_a_successful_partial_inventory(self):
        ie = self.extractor([feed([video('bbb')], 'page3'), feed([video('ccc')], 'page2')])
        with self.assertRaisesRegex(ExtractorError, 'did not advance'):
            list(ie._entries(feed([video('aaa')], 'page2'), 'channel'))
        self.assertEqual(ie._download_json.call_count, 2)

    def test_missing_feed_and_broken_pagination_fail(self):
        for data in [{}, {'items': None}, {'items': [], 'more': {'link': 'invalid'}},
                     {'items': [], 'more': {'link': 'https://dzen.ru/api/feed'}}]:
            with self.subTest(data=data), self.assertRaisesRegex(ExtractorError, 'incomplete'):
                list(self.extractor()._entries(data, 'channel'))

    def test_failed_next_page_propagates(self):
        ie = self.extractor([ExtractorError('network failure')])
        with self.assertRaisesRegex(ExtractorError, 'network failure'):
            list(ie._entries(feed([video('aaa')], 'next'), 'channel'))

    def test_empty_terminal_page_is_valid(self):
        self.assertEqual(list(self.extractor()._entries(feed([]), 'channel')), [])

    def test_missing_ssr_feed_is_actionable(self):
        ie = self.extractor()
        ie._fetch_ssr_data = Mock(return_value=('channel', {'exportResponse': {}}))
        with self.assertRaisesRegex(ExtractorError, 'profile feed is missing'):
            ie._real_extract('https://dzen.ru/example')


if __name__ == '__main__':
    unittest.main()
