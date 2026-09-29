"""Run with Python and gallery-dl 1.32.11 or the pinned nightly source installed."""
import re
import io
import json
from contextlib import redirect_stderr
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'resources/gallery-dl-extractors'))
from instagram_web import (VidBeeInstagramPostExtractor, InstagramWebMixin, VidBeeInstagramPostsExtractor, VidBeeInstagramReelsExtractor,
    VidBeeInstagramStoriesExtractor, VidBeeInstagramHighlightsExtractor, VidBeeInstagramTaggedExtractor)
from requests.cookies import RequestsCookieJar


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
    def test_all_profile_categories_preserve_session_csrf(self):
        for cls, path in [
            (VidBeeInstagramPostExtractor, 'p/FIXTURE/'),
            (VidBeeInstagramPostExtractor, 'reel/FIXTURE/'),
            (VidBeeInstagramPostsExtractor, 'fixture/posts/'),
            (VidBeeInstagramReelsExtractor, 'fixture/reels/'),
            (VidBeeInstagramStoriesExtractor, 'stories/fixture/'),
            (VidBeeInstagramHighlightsExtractor, 'fixture/highlights/'),
            (VidBeeInstagramTaggedExtractor, 'fixture/tagged/'),
        ]:
            with self.subTest(category=path):
                ie = cls(re.match(cls.pattern, 'https://www.instagram.com/' + path))
                ie.cookies = RequestsCookieJar()
                ie.cookies.set('csrftoken', 'fixture-token', domain='.instagram.com')
                ie._init()
                self.assertEqual(ie.csrf_token, 'fixture-token')
                self.assertEqual(ie.cookies.get('csrftoken', domain='.instagram.com'), 'fixture-token')

    def test_mapping_progress_keeps_images_and_videos_without_cdn_urls(self):
        ie = object.__new__(VidBeeInstagramPostsExtractor)
        ie.config = Mock(return_value=True)
        records = [(3, 'https://cdn.invalid/private-token.jpg', {
            'post_url': 'https://www.instagram.com/p/IMAGE/', 'media_id': '1', 'extension': 'jpg'
        }), (3, 'https://cdn.invalid/private-token.mp4', {
            'post_url': 'https://www.instagram.com/reel/VIDEO/', 'media_id': '2', 'extension': 'mp4'
        })]
        stream = io.StringIO()
        with patch('instagram_web.InstagramPostsExtractor.items', return_value=iter(records)):
            with redirect_stderr(stream):
                self.assertEqual(list(ie.items()), records)
        lines = stream.getvalue().splitlines()
        self.assertEqual(len(lines), 2)
        self.assertNotIn('private-token', stream.getvalue())
        self.assertEqual([json.loads(line.removeprefix('VIDBEE_MAP:'))[2]['media_id'] for line in lines], ['1', '2'])
        ie.config.return_value = False
        stream = io.StringIO()
        with patch('instagram_web.InstagramPostsExtractor.items', return_value=iter(records)):
            with redirect_stderr(stream):
                self.assertEqual(list(ie.items()), records)
        self.assertEqual(stream.getvalue(), '')

    def test_highlights_falls_back_only_for_home_redirect(self):
        ie = object.__new__(VidBeeInstagramHighlightsExtractor)
        ie.exc = SimpleNamespace(AbortExtraction=RuntimeError)
        ie._saved_mapping_cache = {}
        ie._rest_highlights_tray = Mock(side_effect=RuntimeError('HTTP redirect to home page'))
        with patch('instagram_web.InstagramGraphqlAPI') as graphql:
            graphql.return_value._call.return_value = {'user': {'edge_highlight_reels': {'edges': [{'node': {'id': '123'}}]}}}
            self.assertEqual(ie._highlights_tray('42'), [{'id': 'highlight:123'}])
            self.assertEqual(graphql.return_value._call.call_args.args[1]['user_id'], '42')
            self.assertFalse(graphql.return_value._call.call_args.args[1]['include_logged_out_extras'])
        ie._rest_highlights_tray.side_effect = RuntimeError('HTTP redirect to login page')
        with patch('instagram_web.InstagramGraphqlAPI') as graphql:
            with self.assertRaisesRegex(RuntimeError, 'login'):
                ie._highlights_tray('42')
            graphql.assert_not_called()

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

    def test_tagged_uses_web_query_and_resolves_grid_media(self):
        grid_video = {**media('2', True), 'video_versions': None}
        def tagged(nodes, cursor=None, more=False):
            return {'xdt_api__v1__usertags__user_id__feed_connection': {
                'edges': [{'node': node} for node in nodes],
                'page_info': {'has_next_page': more, 'end_cursor': cursor}}}
        ie = Harness([tagged([media('1')], 'next', True), tagged([grid_video])])
        ie.user_id = '456'
        posts = list(ie._web_pages(tagged=True))
        self.assertEqual(len(posts), 2)
        self.assertTrue(posts[1]['video_versions'])
        self.assertEqual(ie.api.media.call_count, 2)
        ie.api.user_id.assert_not_called()
        first, second = (call.args for call in ie._web_query.call_args_list)
        self.assertEqual((first[0], first[1]['after'], first[1]['user_id']), (ie._TAGGED_PAGE, None, '456'))
        self.assertEqual(second[1]['after'], 'next')

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

    def test_incremental_posts_stop_at_known_history_without_fetching_older_pages(self):
        ie = Harness([page(['2', '1'], 'older', True)])
        ie._COUNT = 1
        ie._saved_mapping_cache = {'state': 'ready', 'items': [{'url': 'https://www.instagram.com/p/B/'}]}
        self.assertEqual([post['pk'] for post in ie._web_pages()], ['2'])
        self.assertEqual(ie._web_query.call_count, 1)

    def test_cancelled_posts_resume_from_saved_cursor(self):
        ie = Harness([page(['3'])])
        ie._saved_mapping_cache = {'state': 'cancelled', 'cursor': 'saved-page', 'items': []}
        self.assertEqual([post['pk'] for post in ie._web_pages()], ['3'])
        operation, variables = ie._web_query.call_args.args
        self.assertEqual(operation, ie._POSTS_PAGE)
        self.assertEqual(variables['after'], 'saved-page')

    def test_highlights_skip_unchanged_collections_but_keep_updated_ones(self):
        ie = object.__new__(VidBeeInstagramHighlightsExtractor)
        ie.exc = SimpleNamespace(AbortExtraction=RuntimeError)
        ie._saved_mapping_cache = {'state': 'ready', 'items': [{'url': 'https://www.instagram.com/stories/highlights/1/', 'sourceVersion': '10:2', 'assetCount': 2}]}
        unchanged = {'id': 'highlight:1', 'latest_reel_media': 10, 'media_count': 2}
        ie._rest_highlights_tray = Mock(return_value=[unchanged])
        self.assertEqual(ie._highlights_tray('42'), [])
        changed = {**unchanged, 'media_count': 3}
        ie._rest_highlights_tray.return_value = [changed]
        self.assertEqual(ie._highlights_tray('42'), [changed])
        # Missing freshness fields cannot safely prove that a collection is unchanged.
        ie._rest_highlights_tray.return_value = [{'id': 'highlight:1'}]
        self.assertEqual(ie._highlights_tray('42'), [{'id': 'highlight:1'}])

    def test_empty_collection_requires_valid_pagination(self):
        self.assertEqual(list(Harness([page([])])._web_pages()), [])
        with self.assertRaisesRegex(RuntimeError, 'invalid profile pagination'):
            list(Harness([{'xdt_api__v1__feed__user_timeline_graphql_connection': {'edges': []}}])._web_pages())


if __name__ == '__main__':
    unittest.main()
