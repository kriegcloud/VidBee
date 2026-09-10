"""Run with Python and gallery-dl 1.32.11 or the pinned nightly source installed."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'resources/gallery-dl-extractors'))
from instagram_web import InstagramWebMixin


def media(pk, video=False):
    return {'pk': pk, '__typename': 'XDTMediaDict', 'media_type': 2 if video else 1,
            'image_versions2': {'candidates': [{'url': 'https://example.com/image.jpg'}]},
            'video_versions': [{'url': 'https://example.com/video.mp4'}] if video else []}


def page(ids, cursor=None, more=False, reels=False):
    edges = [{'node': {'media': media(pk)} if reels else media(pk)} for pk in ids]
    connection = {'edges': edges, 'page_info': {'has_next_page': more, 'end_cursor': cursor}}
    return {'fetch__XDTUserDict': {'clips_connection': connection}} if reels else {
        'xdt_api__v1__feed__user_timeline_graphql_connection': connection}


class Harness(InstagramWebMixin):
    item = 'fixture'
    exc = SimpleNamespace(AbortExtraction=RuntimeError)

    def __init__(self, pages):
        self._web_query = Mock(side_effect=pages)
        self.api = SimpleNamespace(user_id=Mock(return_value='123'), media=Mock(return_value=[media('1', True)]))


class TestInstagramWeb(unittest.TestCase):
    def test_posts_paginate_deduplicate_and_use_rest_shape(self):
        ie = Harness([page(['1', '2'], 'next', True), page(['2', '3'])])
        self.assertEqual([p['pk'] for p in ie._web_pages()], ['1', '2', '3'])
        operation, variables = ie._web_query.call_args.args
        self.assertEqual(operation, ie._POSTS_PAGE)
        self.assertEqual(variables['after'], 'next')
        self.assertEqual(variables['username'], 'fixture')

    def test_reels_resolve_video_details_and_paginate(self):
        ie = Harness([page(['1'], 'next', True, True), page(['2'], reels=True)])
        posts = list(ie._web_pages(True))
        self.assertEqual(len(posts), 2)
        self.assertTrue(all(p['video_versions'] for p in posts))
        self.assertTrue(all('__typename' not in p for p in posts))
        self.assertEqual(ie.api.media.call_count, 2)
        operation, variables = ie._web_query.call_args.args
        self.assertEqual(operation, ie._REELS_PAGE)
        self.assertEqual(variables['id'], '123')

    def test_missing_collection_does_not_look_empty(self):
        with self.assertRaisesRegex(RuntimeError, 'no profile collection'):
            list(Harness([{}])._web_pages())

    def test_repeated_cursor_fails(self):
        with self.assertRaisesRegex(RuntimeError, 'did not advance'):
            list(Harness([page(['1'], 'same', True), page(['2'], 'same', True)])._web_pages())

    def test_failed_page_is_not_success(self):
        ie = Harness([page(['1'], 'next', True), RuntimeError('query failed')])
        with self.assertRaisesRegex(RuntimeError, 'query failed'):
            list(ie._web_pages())

    def test_missing_video_never_downloads_a_thumbnail_as_a_reel(self):
        ie = Harness([page(['1'], reels=True)])
        bad = media('1', True)
        bad['video_versions'] = []
        ie.api.media.return_value = [bad]
        with self.assertRaisesRegex(RuntimeError, 'video formats'):
            list(ie._web_pages(True))

    def test_empty_collection_requires_valid_pagination(self):
        self.assertEqual(list(Harness([page([])])._web_pages()), [])
        with self.assertRaisesRegex(RuntimeError, 'invalid profile pagination'):
            list(Harness([{'xdt_api__v1__feed__user_timeline_graphql_connection': {'edges': []}}])._web_pages())


if __name__ == '__main__':
    unittest.main()
