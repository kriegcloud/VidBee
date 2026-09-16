"""Run with Python and gallery-dl 1.32.11 installed."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from requests.cookies import RequestsCookieJar

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'resources/gallery-dl-extractors'))
from threads_web import (ThreadsWebExtractor, VidBeeThreadsProfileExtractor,
                         VidBeeThreadsPostExtractor, bundle_operation, module_data,
                         post_id, shortcode_from_id, _POST_QUERY)


def media(pk='1234567890', video=False):
    return {'pk': pk, 'code': shortcode_from_id(pk), 'user': {'pk': '42'},
            'media_type': 2 if video else 1,
            'image_versions2': {'candidates': [
                {'url': 'https://cdninstagram.com/small.jpg', 'width': 100, 'height': 100},
                {'url': 'https://cdninstagram.com/large.jpg', 'width': 1000, 'height': 1000}]},
            'video_versions': [{'url': 'https://cdninstagram.com/video.mp4'}] if video else []}


def page(posts, cursor=None, more=False):
    return {'mediaData': {'edges': [{'node': {'thread_items': [{'post': p}]}} for p in posts],
                          'page_info': {'has_next_page': more, 'end_cursor': cursor}}}


class Harness(ThreadsWebExtractor):
    exc = SimpleNamespace(AbortExtraction=RuntimeError)

    def __init__(self, pages=(), shortcode=None):
        self._query = Mock(side_effect=pages)
        self.user_id = '42'
        self.username = 'fixture'
        self.shortcode = shortcode
        self._bootstrap = Mock()


class TestThreadsWeb(unittest.TestCase):
    def test_urls_and_shortcodes(self):
        self.assertIsNotNone(VidBeeThreadsProfileExtractor.from_url('https://threads.net/@user/media'))
        self.assertIsNone(VidBeeThreadsProfileExtractor.from_url('https://threads.net/@user/replies'))
        self.assertIsNotNone(VidBeeThreadsPostExtractor.from_url('https://threads.com/@user/post/DZ7eGA1G7wU'))
        self.assertEqual(shortcode_from_id(post_id('DZ7eGA1G7wU')), 'DZ7eGA1G7wU')

    def test_profile_paginates_and_deduplicates(self):
        ie = Harness([page([media()], 'next', True), page([media(), media('1234567891')])])
        self.assertEqual(len(list(ie._posts())), 2)
        self.assertEqual(ie._query.call_args.args[1], {'userID': '42', 'first': 12, 'after': 'next'})

    def test_profile_excludes_reposts_replies_and_thread_children(self):
        other = media(); other['user']['pk'] = '13'
        reply = media(); reply['text_post_app_info'] = {'reply_to_author': {'pk': '42'}}
        repost = media(); repost['text_post_app_info'] = {'reposted_post': media()}
        data = page([other, reply, repost, media('1234567891')])
        data['mediaData']['edges'][-1]['node']['thread_items'].append({'post': media('1234567892')})
        self.assertEqual([p['pk'] for p in Harness([data])._posts()], ['1234567891'])

    def test_broken_pagination_and_missing_collection_fail(self):
        for data in ({}, {'mediaData': {'edges': []}}, page([], 'same', True)):
            with self.subTest(data=data):
                with self.assertRaises(RuntimeError):
                    list(Harness([data, data])._posts())

    def test_failed_second_page_is_not_success(self):
        ie = Harness([page([media()], 'next', True), RuntimeError('failed')])
        with self.assertRaisesRegex(RuntimeError, 'failed'):
            list(ie.items())

    def test_single_post_and_deleted_post(self):
        ie = Harness([{'media': media()}], shortcode='DZ7eGA1G7wU')
        self.assertEqual(len(list(ie._posts())), 1)
        self.assertEqual(ie._query.call_args.args, (_POST_QUERY, {'postID': post_id('DZ7eGA1G7wU')}))
        with self.assertRaisesRegex(RuntimeError, 'unavailable'):
            list(Harness([{'media': None}], shortcode='DZ7eGA1G7wU')._posts())

    def test_largest_image_video_and_mixed_carousel(self):
        post = media(); post['media_type'] = 8
        post['carousel_media'] = [media(), media(video=True)]
        post['carousel_media'][1]['media_type'] = None
        ie = Harness([{'media': post}], shortcode='DZ7eGA1G7wU')
        messages = list(ie.items())
        self.assertEqual([len(m) for m in messages], [3, 3, 3])
        self.assertEqual([m[1] for m in messages[1:]],
                         ['https://cdninstagram.com/large.jpg', 'https://cdninstagram.com/video.mp4'])
        self.assertEqual([m[-1]['num'] for m in messages[1:]], [1, 2])

    def test_missing_formats_never_fall_back_to_video_thumbnail(self):
        bad_video = media(video=True); bad_video['video_versions'] = []
        bad_carousel = media(); bad_carousel['media_type'] = 8
        for post in (bad_video, bad_carousel, {'media_type': 1}):
            with self.subTest(post=post):
                with self.assertRaises(RuntimeError):
                    list(Harness()._assets(post))

    def test_empty_media_and_unsafe_path_fail(self):
        with self.assertRaisesRegex(RuntimeError, 'No downloadable media'):
            list(Harness([page([])]).items())
        bad = media(); bad['code'] = '../escape'
        with self.assertRaisesRegex(RuntimeError, 'invalid post code'):
            list(Harness([{'media': bad}], shortcode='ABCDE').items())

    def test_missing_cookies_is_actionable(self):
        ie = VidBeeThreadsProfileExtractor.from_url('https://threads.com/@fixture')
        ie.cookies = RequestsCookieJar()
        with self.assertRaisesRegex(ie.exc.AbortExtraction, 'Log in to Threads'):
            ie._bootstrap()

    def test_profile_bootstrap_resolves_username_without_trusting_viewer_id(self):
        ie = VidBeeThreadsProfileExtractor.from_url('https://threads.com/@fixture')
        ie.cookies = RequestsCookieJar()
        for name in ('sessionid', 'csrftoken'):
            ie.cookies.set(name, 'fixture', domain='.threads.com')
        ie.request = Mock(return_value=SimpleNamespace(text=
            '["DTSGInitialData",[],{"token":"fixture"},1],'
            '["LSD",[],{"token":"fixture"},1],"user_id":"999"'))
        ie._query = Mock(return_value={'user': {'username': 'fixture', 'pk': '42'}})
        ie._bootstrap()
        self.assertEqual(ie.user_id, '42')
        self.assertEqual(ie._query.call_args.args[1], {'username': 'fixture'})
        ie._query.return_value = {'user': {'username': 'wrong', 'pk': '999'}}
        with self.assertRaisesRegex(ie.exc.AbortExtraction, 'username changed'):
            ie._bootstrap()

    def test_refresh_reads_modular_id_and_runs_once(self):
        ie = Harness()
        ie._refreshed = set(); ie._operations = {}; ie._providers = {}
        ie._page = '<script src="https://static.cdninstagram.com/test.js"></script>'
        ie.request = Mock(return_value=SimpleNamespace(status_code=200, text=
            '__d("TestQuery_threadsRelayOperation",[],(function(t,n,r,o,a,i){a.exports="67890"}),null);'
            '"__relay_internal__pv__NewFlagrelayprovider"'))
        self.assertTrue(ie._refresh_operation('TestQuery'))
        self.assertEqual(ie._operations['TestQuery'], '67890')
        self.assertFalse(ie._providers['__relay_internal__pv__NewFlagrelayprovider'])
        self.assertFalse(ie._refresh_operation('TestQuery'))
        self.assertEqual(ie.request.call_count, 1)

    def test_bootstrap_modules_and_bundle_metadata(self):
        self.assertEqual(module_data('["LSD",[],{"token":"fixture"},1]', 'LSD'), {'token': 'fixture'})
        self.assertEqual(module_data('[]', 'LSD'), {})
        result = bundle_operation('id:"12345",metadata:{},name:"TestQuery";"__relay_internal__pv__NewFlagrelayprovider"', 'TestQuery')
        self.assertEqual(result, ('12345', {'__relay_internal__pv__NewFlagrelayprovider'}))
        self.assertEqual(bundle_operation('__d("TestQuery_threadsRelayOperation",[],(function(t,n,r,o,a,i){a.exports="67890"}),null);', 'TestQuery'), ('67890', set()))
        self.assertIsNone(bundle_operation('id:"12345",metadata:{},name:"OtherQuery"', 'TestQuery'))

    def test_rejected_query_refreshes_once_and_auth_errors_do_not_retry(self):
        ie = Harness()
        ie._body = {'lsd': 'fixture'}; ie._csrf = 'fixture'
        ie._operations = {}; ie._providers = {}
        ie._refresh_operation = Mock(return_value=True)
        bad = SimpleNamespace(status_code=200, json=lambda: {'errors': [{'message': 'stale'}]})
        good = SimpleNamespace(status_code=200, json=lambda: {'data': {'media': media()}})
        ie.request = Mock(side_effect=[bad, good])
        self.assertIn('media', ThreadsWebExtractor._query(ie, _POST_QUERY, {}))
        self.assertEqual(ie._refresh_operation.call_count, 1)
        ie.request = Mock(return_value=bad)
        with self.assertRaisesRegex(RuntimeError, 'rejected its media query'):
            ThreadsWebExtractor._query(ie, _POST_QUERY, {})
        self.assertEqual(ie.request.call_count, 2)
        ie.request = Mock(return_value=SimpleNamespace(status_code=403))
        with self.assertRaisesRegex(RuntimeError, 'refresh your login cookies'):
            ThreadsWebExtractor._query(ie, _POST_QUERY, {})
        self.assertEqual(ie.request.call_count, 1)


if __name__ == '__main__':
    unittest.main()
