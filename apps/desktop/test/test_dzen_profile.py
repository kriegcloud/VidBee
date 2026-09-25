"""Offline regression tests for the bundled Dzen profile extractor."""
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'vendor/yt-dlp'))
from yt_dlp.extractor.yandexvideo import ZenYandexChannelIE
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
