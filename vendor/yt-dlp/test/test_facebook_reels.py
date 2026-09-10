import json
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs

from yt_dlp import YoutubeDL
from yt_dlp.extractor.facebook import FacebookIE, FacebookReelIE
from yt_dlp.extractor.facebook_reels import FacebookReelsIE
from yt_dlp.utils import ExtractorError


def collection(ids, cursor=None, has_next=False):
    return {'id': 'fixture-collection', 'aggregated_fb_shorts': {
        'edges': [{'profile_reel_node': {'node': {
            'attachments': [{'media': {'__typename': 'Video', 'id': video_id, 'length_in_second': 12.5}}],
            'message': {'text': f'Reel {video_id}'},
        }}} for video_id in ids],
        'page_info': {'end_cursor': cursor, 'has_next_page': has_next},
    }}


def webpage(data):
    return '<script type="application/json" data-sjs>' + json.dumps({
        'require': [['RelayPrefetchedStreamCache', 'next', [], ['cache', {
            '__bbox': {'result': {'data': {'node': data}}},
        }]]],
    }) + '</script>'


class TestFacebookReels(unittest.TestCase):
    def setUp(self):
        self.ydl = YoutubeDL({'quiet': True, 'no_warnings': True})
        self.ie = FacebookReelsIE(self.ydl)
        self.addCleanup(self.ydl.close)

    def test_matching(self):
        for url in ('https://www.facebook.com/makenzeebush/reels',
                    'https://m.facebook.com/123/reels/?sk=reels',
                    'http://web.facebook.com/example.name/reels#videos'):
            with self.subTest(url=url):
                self.assertTrue(FacebookReelsIE.suitable(url))
                self.assertFalse(FacebookReelIE.suitable(url))
        for url in ('https://www.facebook.com/reel/123', 'https://www.facebook.com/example/reels/123',
                    'https://www.facebook.com/groups/reels', 'https://facebook.com.example.org/example/reels',
                    'https://user:password@www.facebook.com/example/reels',
                    'https://www.facebook.com:8080/example/reels', 'ftp://www.facebook.com/example/reels'):
            with self.subTest(url=url):
                self.assertFalse(FacebookReelsIE.suitable(url))

    def test_listing_uses_only_the_profile_collection(self):
        html = webpage(collection(['123', '456'])) + webpage({'video': {'id': '999'}})
        with patch.object(self.ie, '_download_webpage', return_value=html) as download:
            result = self.ie._real_extract('http://m.facebook.com/fixture/reels/?tracking=ignored')
        download.assert_called_once_with('https://www.facebook.com/fixture/reels', 'fixture')
        self.assertEqual(result['_type'], 'playlist')
        self.assertEqual(result['title'], 'fixture - Reels')
        self.assertEqual([entry['id'] for entry in result['entries']], ['123', '456'])
        self.assertEqual(result['entries'][0]['ie_key'], 'FacebookReel')
        self.assertEqual(result['entries'][0]['url'], 'https://www.facebook.com/reel/123')
        self.assertEqual(result['entries'][0]['duration'], 12.5)

    def test_pagination_deduplicates_overlapping_pages(self):
        with (patch.object(self.ie, '_pagination_context', return_value=({}, {})),
              patch.object(self.ie, '_download_reels_page', return_value=collection(['456', '789'])) as download,
              patch.object(self.ie, '_sleep')):
            entries = list(self.ie._entries(collection(['123', '456'], 'cursor-one', True), '', 'fixture'))
        self.assertEqual([entry['id'] for entry in entries], ['123', '456', '789'])
        self.assertEqual(download.call_args.args[1:3], ('fixture-collection', 'cursor-one'))

    def test_repeated_cursor_is_an_error(self):
        first = collection(['123'], 'cursor-one', True)
        with (patch.object(self.ie, '_pagination_context', return_value=({}, {})),
              patch.object(self.ie, '_download_reels_page', return_value=first),
              patch.object(self.ie, '_sleep'), self.assertRaisesRegex(ExtractorError, 'did not advance')):
            list(self.ie._entries(first, '', 'fixture'))

    def test_failed_page_does_not_return_a_partial_playlist(self):
        with (patch.object(self.ie, '_download_webpage', return_value=webpage(collection(['123'], 'one', True))),
              patch.object(self.ie, '_pagination_context', return_value=({}, {})),
              patch.object(self.ie, '_download_reels_page', side_effect=ExtractorError('page failed')),
              patch.object(self.ie, '_sleep'), self.assertRaisesRegex(ExtractorError, 'page failed')):
            self.ie._real_extract('https://www.facebook.com/fixture/reels')

    def test_missing_private_or_malformed_collection_is_not_success(self):
        with self.assertRaisesRegex(ExtractorError, 'cookies'):
            self.ie._collection_from_webpage('<form id="login_form"></form>', 'fixture')
        for data in ({'aggregated_fb_shorts': {}},
                     {'aggregated_fb_shorts': {'edges': [], 'page_info': {}}},
                     {'aggregated_fb_shorts': {'edges': [{}], 'page_info': {'has_next_page': False}}},
                     collection(['123'], None, True)):
            with self.subTest(data=data), self.assertRaises(ExtractorError):
                list(self.ie._entries(data, '', 'fixture'))

    def test_empty_collection(self):
        self.assertEqual(list(self.ie._entries(collection([]), '', 'fixture')), [])

    def test_runtime_session_and_feature_flags(self):
        modules = [['DTSGInitialData', [], {'token': 'fixture-dtsg'}], ['LSD', [], {'token': 'fixture-lsd'}],
                   ['SiteData', [], {'haste_session': 'fixture-haste', 'client_revision': 123}],
                   ['CurrentUserInitialData', [], {'USER_ID': '42'}]]
        html = json.dumps(modules, separators=(',', ':')) + '{"__relay_internal__pv__Fixture":true}'
        body, variables = self.ie._pagination_context(html, 'fixture')
        self.assertEqual(body['fb_dtsg'], 'fixture-dtsg')
        self.assertEqual(body['__user'], '42')
        self.assertEqual(body['__hs'], 'fixture-haste')
        self.assertIs(variables['__relay_internal__pv__Fixture'], True)
        self.assertEqual(body['jazoest'], '2' + str(sum(map(ord, 'fixture-dtsg'))))

    def test_streamed_graphql_response(self):
        expected = collection(['123'])
        response = '\n'.join(['for (;;);' + json.dumps({'data': {'node': expected}}),
                              json.dumps({'label': 'deferred', 'path': ['node'], 'data': {'count': 3}})])
        with patch.object(self.ie, '_download_webpage', return_value=response) as download:
            result = self.ie._download_reels_page('fixture', 'collection-id', 'cursor', ({'lsd': 'fixture'}, {'count': 1}), 2)
        self.assertEqual(result, expected)
        self.assertEqual(download.call_args.args[0], 'https://www.facebook.com/api/graphql')
        body = parse_qs(download.call_args.kwargs['data'].decode())
        self.assertEqual(json.loads(body['variables'][0]), {'count': 1, 'id': 'collection-id', 'cursor': 'cursor'})
        self.assertEqual(download.call_args.kwargs['headers']['Sec-Fetch-Site'], 'same-origin')

    def test_graphql_errors_are_not_an_empty_success(self):
        for response in ({'error': 1357055}, {'errors': [{'message': 'failed'}]}, {'data': {}}):
            with (self.subTest(response=response),
                  patch.object(self.ie, '_download_webpage', return_value=json.dumps(response)),
                  self.assertRaisesRegex(ExtractorError, 'incomplete')):
                self.ie._download_reels_page('fixture', 'id', 'cursor', ({'lsd': 'fixture'}, {}), 2)

    def test_individual_reels_use_the_canonical_page(self):
        ie = FacebookReelIE(self.ydl)
        with patch.object(ie, '_extract_from_url', return_value={'id': '123'}) as extract:
            self.assertEqual(ie._real_extract('https://m.facebook.com/reel/123?tracking=ignored'), {'id': '123'})
        extract.assert_called_once_with('https://www.facebook.com/reel/123', '123')


if __name__ == '__main__':
    unittest.main()


class TestFacebookVideoAlias(unittest.TestCase):
    def test_named_video_falls_back_to_same_reel(self):
        with YoutubeDL({'quiet': True}) as ydl:
            ie = FacebookIE(ydl)
            url = 'https://www.facebook.com/makenzeebush/videos/2678150598974023/?rdid=tracking#'
            with patch.object(ie, '_extract_from_url', side_effect=[ExtractorError('Cannot parse data'), {'id': '2678150598974023'}]) as extract:
                self.assertEqual(ie._real_extract(url)['id'], '2678150598974023')
                self.assertEqual(extract.call_args.args, ('https://www.facebook.com/reel/2678150598974023', '2678150598974023'))

    def test_auth_errors_are_not_retried_as_reels(self):
        with YoutubeDL({'quiet': True}) as ydl:
            ie = FacebookIE(ydl)
            with patch.object(ie, '_extract_from_url', side_effect=ExtractorError('Login required')) as extract:
                with self.assertRaisesRegex(ExtractorError, 'Login required'):
                    ie._real_extract('https://www.facebook.com/name/videos/123/')
                self.assertEqual(extract.call_count, 1)
