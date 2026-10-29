"""Run with Python and the pinned gallery-dl 2026.10.24 source installed."""
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
from instagram_web import (VidBeeInstagramAPI, VidBeeInstagramPostExtractor, InstagramWebMixin, VidBeeInstagramPostsExtractor, VidBeeInstagramReelsExtractor,
    VidBeeInstagramStoriesExtractor, VidBeeInstagramHighlightsExtractor, VidBeeInstagramTaggedExtractor)
from requests.cookies import RequestsCookieJar


def media(pk, video=False):
    return {'pk': pk, '__typename': 'XDTMediaDict', 'media_type': 2 if video else 1,
            'image_versions2': {'candidates': [{'url': 'https://example.com/image.jpg'}]},
            'video_versions': [{'url': 'https://example.com/video.mp4'}] if video else []}


class Harness(InstagramWebMixin):
    item = 'fixture'
    exc = SimpleNamespace(AbortExtraction=RuntimeError)

    def __init__(self):
        self._saved_mapping_cache = {}
        self.api = SimpleNamespace(user=Mock(return_value={'id': '123', 'username': 'fixture'}),
                                   media=Mock(return_value=[media('1', True)]),
                                   _pagination_graphql=Mock(return_value=[]))


def highlight_api(reels):
    api = object.__new__(VidBeeInstagramAPI)
    api.exc = SimpleNamespace(AbortExtraction=RuntimeError)
    api._pagination_graphql = Mock(return_value=iter(reels))
    return api


def highlight(identifier='1'):
    return {'id': 'highlight:' + identifier, 'items': [media('101')],
            'user': {'pk': '42', 'username': 'fixture'}}


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

    def test_highlight_query_includes_story_viewer_provider(self):
        reel = highlight()
        api = highlight_api([reel])
        self.assertEqual(list(api.reels_media(['highlight:1'])), [reel])
        operation, variables, field = api._pagination_graphql.call_args.args
        self.assertEqual(operation, 'PolarisStoriesV3ReelPageGalleryQuery')
        self.assertEqual(field, 'xdt_api__v1__feed__reels_media__connection')
        self.assertEqual(variables['reel_ids'], ['highlight:1'])
        self.assertTrue(variables['__relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider'])

    def test_empty_highlight_shell_is_not_a_successful_empty_map(self):
        for changes in [{'items': [], 'user': None}, {'items': []}, {'user': None}]:
            with self.subTest(changes=changes):
                api = highlight_api([{**highlight(), **changes}])
                with self.assertRaisesRegex(RuntimeError, 'incomplete highlight'):
                    list(api.reels_media(['highlight:1']))

    def test_missing_highlight_preserves_progress_then_reports_incomplete(self):
        reel = highlight()
        api = highlight_api([reel])
        stream = api.reels_media(['highlight:1', 'highlight:2'])
        self.assertEqual(next(stream), reel)
        with self.assertRaisesRegex(RuntimeError, 'all requested highlights'):
            next(stream)

    def test_no_returned_highlights_is_not_success(self):
        with self.assertRaisesRegex(RuntimeError, 'all requested highlights'):
            list(highlight_api([]).reels_media(['highlight:1']))

    def test_expired_ordinary_stories_can_still_be_empty(self):
        self.assertEqual(list(highlight_api([]).reels_media(['42'])), [])

    def test_saved_highlight_download_uses_fixed_api(self):
        cls = VidBeeInstagramStoriesExtractor
        ie = cls(re.match(cls.pattern, 'https://www.instagram.com/stories/highlights/1/'))
        ie.cookies = RequestsCookieJar()
        ie._init()
        self.assertIsInstance(ie.api, VidBeeInstagramAPI)
        reel = highlight()
        ie.api._pagination_graphql = Mock(return_value=iter([reel]))
        self.assertEqual(ie.posts(), [reel])
        variables = ie.api._pagination_graphql.call_args.args[1]
        self.assertTrue(variables['__relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider'])

    def test_highlights_chunk_and_skip_only_proven_unchanged_collections(self):
        ie = object.__new__(VidBeeInstagramHighlightsExtractor)
        ie.item = 'fixture'
        ie._saved_mapping_cache = {'state': 'ready', 'items': [{
            'url': 'https://www.instagram.com/stories/highlights/1/',
            'sourceVersion': '10:2', 'assetCount': 2}]}
        unchanged = {'id': 'highlight:1', 'latest_reel_media': 10, 'media_count': 2}
        tray = [unchanged] + [{'id': f'highlight:{i}'} for i in range(2, 9)]
        ie.api = SimpleNamespace(highlights_tray=Mock(return_value=tray), reels_media=Mock(return_value=[]))
        self.assertEqual(list(ie.posts()), [])
        self.assertEqual([c.args[0] for c in ie.api.reels_media.call_args_list], [
            [f'highlight:{i}' for i in range(2, 7)], ['highlight:7', 'highlight:8']])
        for changes in [{'media_count': 3}, {'latest_reel_media': None}]:
            ie.api.highlights_tray.return_value = [{**unchanged, **changes}]
            ie.api.reels_media.reset_mock()
            list(ie.posts())
            ie.api.reels_media.assert_called_once_with(['highlight:1'])

    def test_empty_highlight_tray_needs_no_media_requests(self):
        ie = object.__new__(VidBeeInstagramHighlightsExtractor)
        ie.item = 'fixture'
        ie._saved_mapping_cache = {}
        ie.api = SimpleNamespace(highlights_tray=Mock(return_value=[]), reels_media=Mock())
        self.assertEqual(list(ie.posts()), [])
        ie.api.reels_media.assert_not_called()

    def test_posts_deduplicate_current_api_nodes(self):
        ie = Harness()
        self.assertEqual([p['pk'] for p in ie._web_posts([media('1'), media('2'), media('1')])], ['1', '2'])

    def test_reels_resolve_video_details(self):
        ie = Harness()
        posts = list(ie._web_posts([media('1'), media('2')], resolve=ie.api.media))
        self.assertEqual(len(posts), 2)
        self.assertTrue(all(p['video_versions'] for p in posts))
        self.assertEqual(ie.api.media.call_count, 2)

    def test_missing_media_never_looks_like_success(self):
        ie = Harness()
        with self.assertRaisesRegex(RuntimeError, 'unreadable media'):
            list(ie._web_posts([{}]))
        ie.api.media.return_value = []
        with self.assertRaisesRegex(RuntimeError, 'details are unavailable'):
            list(ie._web_posts([media('1')], resolve=ie.api.media))
        bad = media('1', True)
        bad['video_versions'] = []
        ie.api.media.return_value = [bad]
        with self.assertRaisesRegex(RuntimeError, 'video formats'):
            list(ie._web_posts([media('1')], resolve=ie.api.media))

    def test_incremental_posts_stop_before_older_history(self):
        ie = Harness()
        ie._saved_mapping_cache = {'state': 'ready', 'items': [{'url': 'https://www.instagram.com/p/B/'}]}
        def nodes():
            yield media('2')
            for i in range(1, 13):
                yield {**media(str(100 + i)), 'code': 'B'}
            raise AssertionError('Older history must not be fetched')
        self.assertEqual([p['pk'] for p in ie._web_posts(nodes())], ['2'])

    def test_cancelled_posts_restore_cursor_before_lazy_pagination(self):
        ie = Harness()
        ie._saved_mapping_cache = {'state': 'cancelled', 'cursor': 'saved-page', 'items': []}
        def nodes():
            self.assertEqual(ie._init_cursor(), 'saved-page')
            self.assertIsNone(ie._vidbee_resume_cursor)
            yield media('3')
        self.assertEqual([p['pk'] for p in ie._web_posts(nodes())], ['3'])

    def test_profile_tabs_keep_query_routes_and_providers(self):
        for method, path in [('_user_feed', ''), ('_user_reels', '/reels'), ('_user_tagged', '/tagged')]:
            with self.subTest(method=method):
                ie = Harness()
                getattr(ie, method)()
                args = ie.api._pagination_graphql.call_args.args
                self.assertEqual(args[3] if len(args) == 4 else '', path)
                self.assertFalse(args[1]['__relay_internal__pv__PolarisSEOIsCrawlerrelayprovider'])


if __name__ == '__main__':
    unittest.main()
