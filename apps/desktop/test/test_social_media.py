"""Offline behavioral tests against VidBee's pinned gallery-dl API."""
import base64
import contextlib
import http.server
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

from gallery_dl import config, extractor, job
from gallery_dl.extractor.common import Extractor, Message
from gallery_dl.extractor import instagram, reddit, tiktok

MODULE = Path(__file__).resolve().parents[1] / 'resources/gallery-dl-extractors/social_media.py'
spec = importlib.util.spec_from_file_location('vidbee_social_test', MODULE)
social = importlib.util.module_from_spec(spec)
spec.loader.exec_module(social)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2r5sAAAAASUVORK5CYII=')


class Handler(http.server.BaseHTTPRequestHandler):
    requests = 0
    video_directory = None

    def do_GET(self):
        type(self).requests += 1
        payload = PNG
        mime = 'image/png'
        if self.video_directory and self.path.startswith('/video/'):
            filename = self.path.rsplit('/', 1)[-1].split('?')[0]
            payload = (Path(self.video_directory) / filename).read_bytes()
            mime = 'application/dash+xml' if filename.endswith('.mpd') else 'video/mp4'
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_):
        pass


class Fixture(Extractor):
    category = 'twitter'
    subcategory = 'tweet'
    pattern = r'https://x.com/fixture/status/(\d+)'
    count = 2
    width = 1
    extension = "png"
    fail = False
    duplicate = False
    alternate_authors = False

    def items(self):
        for i in range(self.count):
            data = {'tweet_id': str(i + 1), 'author': {'name': 'reply' if self.alternate_authors and i else 'fixture'}, 'num': 1,
                    'date': f'2026-09-{15+i}',
                    'extension': self.extension, 'width': self.width, 'height': 1}
            yield Message.Directory, '', data
            yield Message.Url, self.asset_url + '/image.png', data
            if self.duplicate:
                yield Message.Url, self.asset_url + '/image.png', data
        if self.fail:
            self.log.error('Failed to extract a post')


class SocialMediaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        Fixture.asset_url = f'http://127.0.0.1:{cls.server.server_port}'
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        Fixture.extension = "png"
        Fixture.width = 1
        Fixture.count = 2
        Fixture.fail = Fixture.duplicate = Fixture.alternate_authors = False
        Handler.requests = 0
        Handler.video_directory = None
        config.clear()
        config.set(('extractor', 'vidbee-social'), 'destination', self.temp.name)
        config.set(('extractor', 'vidbee-social'), 'run-id', 'fixture')
        config.set(('extractor', 'vidbee-social'), 'source', {'platform': 'x', 'owner': 'fixture'})
        config.set(('extractor',), 'sleep-request', 0)

    def run_download(self, url='https://x.com/fixture/status/1', **options):
        config.set(('extractor', 'vidbee-social'), 'options', options)
        find = extractor.find
        def resolve(url, *args, **kwargs):
            return Fixture.from_url(url) or find(url, *args, **kwargs)
        output = io.StringIO()
        with patch.object(extractor, 'find', resolve), contextlib.redirect_stdout(output):
            download = job.DownloadJob(social.VidBeeSocialExtractor.from_url('vidbee-social:' + url))
            download.run()
        events = [json.loads(line[len(social.PREFIX):]) for line in output.getvalue().splitlines() if line.startswith(social.PREFIX)]
        self.assertTrue(events, output.getvalue())
        return download.status, events[-1]['summary']

    def test_download_refresh_and_missing_file_recovery(self):
        status, result = self.run_download()
        self.assertEqual(status, 0)
        self.assertEqual(result['reason'], 'exhausted')
        self.assertEqual(result['downloaded'], 2)
        self.assertEqual(Handler.requests, 2)
        status, result = self.run_download()
        self.assertEqual(status, 0)
        self.assertEqual(result['existing'], 2)
        self.assertEqual(Handler.requests, 2)
        (Path(self.temp.name) / 'X/fixture/1/1.png').unlink()
        status, result = self.run_download()
        self.assertEqual(status, 0)
        self.assertEqual(result['downloaded'], 1)
        self.assertEqual(result['existing'], 1)

    def test_smaller_image_is_not_success(self):
        Fixture.width = 2000
        status, result = self.run_download()
        self.assertNotEqual(status, 0)
        self.assertEqual(result['reason'], 'incomplete')
        self.assertEqual(result['downloaded'], 0)

    def test_logged_extractor_failure_is_not_exhaustion(self):
        Fixture.fail = True
        status, result = self.run_download()
        self.assertNotEqual(status, 0)
        self.assertEqual(result['reason'], 'incomplete')
        self.assertEqual(result['downloaded'], 2)

    def test_duplicates_and_post_limit(self):
        Fixture.duplicate = True
        status, result = self.run_download(maxPosts=1)
        self.assertEqual(status, 0)
        self.assertEqual(result['reason'], 'limit')
        self.assertEqual(result['downloaded'], 1)
        self.assertEqual(result['posts'], 1)

    def test_media_filter_and_empty_collection(self):
        status, result = self.run_download(media='videos')
        self.assertEqual(status, 0)
        self.assertEqual(result['downloaded'], 0)
        self.assertEqual(result['reason'], 'exhausted')

    def test_corrupt_same_size_file_is_downloaded_again(self):
        self.run_download()
        path = Path(self.temp.name) / 'X/fixture/1/1.png'
        path.write_bytes(b'x' * len(PNG))
        status, result = self.run_download()
        self.assertEqual(status, 0)
        self.assertEqual(result['downloaded'], 1)
        with contextlib.closing(sqlite3.connect(result['manifestPath'])) as db:
            self.assertEqual(db.execute('select count(*) from assets').fetchone()[0], 2)
        self.assertEqual(os.stat(result['manifestPath']).st_mode & 0o777, 0o600)

    def test_refresh_uses_the_native_extension_returned_by_the_cdn(self):
        Fixture.extension = 'webp'
        status, result = self.run_download()
        self.assertEqual(status, 0)
        self.assertEqual(result['downloaded'], 2)
        self.assertTrue((Path(self.temp.name) / 'X/fixture/1/1.png').exists())
        _, result = self.run_download()
        self.assertEqual(result['existing'], 2)
        self.assertEqual(result['downloaded'], 0)
        self.assertEqual(Handler.requests, 2)

    def test_preview_does_not_download_assets(self):
        config.set(('extractor', 'vidbee-social'), 'inspect', True)
        status, result = self.run_download(maxPosts=1)
        self.assertEqual(status, 0)
        self.assertEqual(result['images'], 1)
        self.assertEqual(result['downloaded'], 0)
        self.assertEqual(Handler.requests, 0)
        self.assertEqual(list(Path(self.temp.name).rglob('*.png')), [])

    def test_author_scope_and_date_limits(self):
        Fixture.alternate_authors = True
        _, result = self.run_download(authorOnly=True, scope='thread')
        self.assertEqual(result['posts'], 1)
        _, result = self.run_download(since='2026-09-16')
        self.assertEqual(result['posts'], 1)
        self.assertEqual(result['reason'], 'limit')

    def test_repeated_pagination_fails(self):
        def items(child):
            child.request(Fixture.asset_url, params={'cursor': 'repeated'})
            child.request(Fixture.asset_url, params={'cursor': 'repeated'})
            yield from ()
        with patch.object(Fixture, 'items', items):
            status, result = self.run_download()
        self.assertNotEqual(status, 0)
        self.assertEqual(result['reason'], 'incomplete')
        self.assertEqual(Handler.requests, 1)

    def test_symbolic_link_cannot_escape_destination(self):
        with tempfile.TemporaryDirectory() as other:
            (Path(self.temp.name) / 'X').symlink_to(other, target_is_directory=True)
            status, result = self.run_download()
            self.assertNotEqual(status, 0)
            self.assertEqual(result['reason'], 'incomplete')
            self.assertEqual(list(Path(other).iterdir()), [])

    def test_pinned_tiktok_extractor_keeps_photo_order_and_originals(self):
        item = {'id': '123', 'author': {'uniqueId': 'fixture'}, 'desc': 'photos',
                'createTime': 1789516800, 'imagePost': {'images': [
                    {'imageURL': {'urlList': [Fixture.asset_url + f'/{i}.png']},
                     'imageWidth': 1, 'imageHeight': 1} for i in range(1, 4)]}}
        response = {'webapp.video-detail': {'statusCode': 0, 'itemInfo': {'itemStruct': item}}}
        with patch.object(tiktok.TiktokExtractor, '_extract_rehydration_data', return_value=response):
            status, result = self.run_download(url='https://www.tiktok.com/@fixture/photo/123')
        self.assertEqual(status, 0)
        self.assertEqual(result['images'], 3)
        self.assertEqual(result['videos'], 0)
        for i in range(1, 4):
            self.assertEqual((Path(self.temp.name) / f'TikTok/fixture/123/{i}.png').read_bytes(), PNG)

    def test_pinned_instagram_extractor_downloads_image_only_carousel(self):
        # Image-only carousels have no video formats, so yt-dlp cannot fetch them.
        items = [{'pk': str(i), 'media_type': 1, 'taken_at': 1789516800,
                  'image_versions2': {'candidates': [
                      {'url': Fixture.asset_url + f'/{i}.png', 'width': 1, 'height': 1}]}}
                 for i in range(1, 4)]
        post = {'pk': '99', 'code': 'DYlQVsCDFmP', 'taken_at': 1789516800, 'media_type': 8,
                'caption': None, 'user': {'pk': '7', 'username': 'fixture'}, 'carousel_media': items}
        config.set(('extractor', 'vidbee-social'), 'source',
                   {'platform': 'instagram', 'kind': 'post', 'owner': 'fixture'})
        with patch.object(instagram.InstagramRestAPI, 'media', return_value=[post]):
            status, result = self.run_download(url='https://www.instagram.com/p/DYlQVsCDFmP/')
        self.assertEqual(status, 0)
        self.assertEqual((result['posts'], result['images'], result['videos']), (1, 3, 0))
        for i in range(1, 4):
            self.assertEqual((Path(self.temp.name) / f'Instagram/fixture/99/{i}.png').read_bytes(), PNG)

    def test_pinned_reddit_extractor_includes_comment_media(self):
        post = {'id': 'abc123', 'author': 'fixture', 'created_utc': 1789516800,
                'url': '', 'is_video': False, 'is_self': True, 'selftext_html': '',
                'subreddit': 'fixture', 'title': 'thread'}
        comment = {'id': 'reply', 'author': 'another', 'created_utc': 1789516800,
                   'body_html': '', 'media_metadata': {'asset': {'status': 'valid',
                       's': {'u': Fixture.asset_url + '/reply.png', 'x': 1, 'y': 1}}}}
        with patch.object(reddit.RedditSubmissionExtractor, 'submissions', return_value=iter([(post, [comment])])):
            status, result = self.run_download(url='https://www.reddit.com/comments/abc123', scope='thread')
        self.assertEqual(status, 0)
        self.assertEqual(result['downloaded'], 1)
        self.assertEqual(len(list((Path(self.temp.name) / 'Reddit/fixture/reply').glob('*.png'))), 1)

    def test_pinned_reddit_gallery_quality_metadata_is_enforced(self):
        post = {'id': 'abc123', 'author': 'fixture', 'created_utc': 1789516800,
                'url': 'https://www.reddit.com/gallery/abc123', 'is_video': False,
                'is_self': False, 'selftext_html': '', 'subreddit': 'fixture',
                'title': 'gallery', 'gallery_data': {'items': [{'media_id': 'asset'}]},
                'media_metadata': {'asset': {'status': 'valid',
                    's': {'u': Fixture.asset_url + '/original.png', 'x': 2000, 'y': 1000}}}}
        with patch.object(reddit.RedditSubmissionExtractor, 'submissions', return_value=iter([(post, [])])):
            status, result = self.run_download(url='https://www.reddit.com/comments/abc123')
        self.assertNotEqual(status, 0)
        self.assertEqual(result['reason'], 'incomplete')

    def test_thread_expansion_includes_text_only_parent(self):
        class Feed(Fixture):
            subcategory = 'tweets'
            def items(self):
                yield Message.Directory, '', {'tweet_id': '101', 'author': {'name': 'fixture'}, 'content': 'text only'}
        upstream = extractor.find
        def find(url, *args, **kwargs):
            if url.endswith('/tweets'):
                return Feed.from_url('https://x.com/fixture/status/1')
            if '/i/web/status/' in url:
                return Fixture.from_url('https://x.com/fixture/status/1')
            return upstream(url, *args, **kwargs)
        with patch.object(extractor, 'find', find):
            status, result = self.run_download(url='https://x.com/fixture/tweets', expandThreads=True)
        self.assertEqual(status, 0)
        self.assertEqual(result['downloaded'], 2)

    def test_followed_profile_dispatch_preserves_explicit_graph_scope(self):
        class Following(Fixture):
            subcategory = 'following'
            def items(self):
                yield Message.Queue, 'https://x.com/fixture', {}
        class User(Fixture):
            subcategory = 'user'
            def items(self):
                yield Message.Queue, 'https://x.com/fixture/tweets', {}
        class Tweets(Fixture):
            subcategory = 'tweets'
        upstream = extractor.find
        def find(url, *args, **kwargs):
            cls = {'https://x.com/fixture/following': Following,
                   'https://x.com/fixture': User,
                   'https://x.com/fixture/tweets': Tweets}.get(url)
            return cls.from_url('https://x.com/fixture/status/1') if cls else upstream(url, *args, **kwargs)
        with patch.object(extractor, 'find', find):
            status, result = self.run_download(url='https://x.com/fixture/following', linkedMedia=False)
        self.assertEqual(status, 0)
        self.assertEqual(result['downloaded'], 2)

    def test_linked_subreddit_does_not_start_an_unrelated_feed_crawl(self):
        def items(child):
            yield Message.Queue, 'https://www.reddit.com/r/pics', {}
        with patch.object(Fixture, 'items', items):
            status, result = self.run_download()
        self.assertEqual(status, 0)
        self.assertEqual(result['downloaded'], 0)
        self.assertEqual(Handler.requests, 0)

    def video_fixture(self):
        directory = Path(self.temp.name) / 'fixture'
        directory.mkdir()
        Handler.video_directory = directory
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i',
                        'color=c=blue:s=64x64:r=10:d=1', '-f', 'lavfi', '-i',
                        'sine=frequency=440:duration=1', '-c:v', 'libx264', '-c:a', 'aac',
                        '-shortest', str(directory / 'source.mp4')], check=True)
        return directory

    def assert_video_and_audio(self, filename):
        result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type',
                                 '-of', 'json', str(filename)], capture_output=True, text=True, check=True)
        self.assertEqual({stream['codec_type'] for stream in json.loads(result.stdout)['streams']}, {'video', 'audio'})

    def test_pinned_reddit_dash_download_preserves_video_and_audio(self):
        directory = self.video_fixture()
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-i', str(directory / 'source.mp4'),
                        '-map', '0:v', '-map', '0:a', '-c', 'copy', '-f', 'dash',
                        str(directory / 'manifest.mpd')], check=True)
        post = {'id': 'abc123', 'author': 'fixture', 'created_utc': 1789516800,
                'url': 'https://v.redd.it/fixture', 'is_video': True, 'is_self': False,
                'selftext_html': '', 'subreddit': 'fixture', 'title': 'video',
                'secure_media': {'reddit_video': {'dash_url': Fixture.asset_url + '/video/manifest.mpd'}}}
        with patch.object(reddit.RedditSubmissionExtractor, 'submissions', return_value=iter([(post, [])])):
            status, result = self.run_download(url='https://www.reddit.com/comments/abc123')
        self.assertEqual(status, 0)
        self.assertEqual(result['videos'], 1)
        self.assertEqual(result['downloaded'], 1)
        files = list((Path(self.temp.name) / 'Reddit').rglob('*.mp4'))
        self.assertEqual(len(files), 1)
        self.assert_video_and_audio(files[0])

    def test_pinned_tiktok_video_selects_highest_rendition(self):
        self.video_fixture()
        item = {'id': '123', 'author': {'uniqueId': 'fixture'}, 'desc': 'video',
                'createTime': 1789516800, 'video': {'format': 'mp4', 'width': 64, 'height': 64,
                'bitrateInfo': [
                    {'PlayAddr': {'Width': 16, 'Height': 16, 'UrlList': ['http://invalid.invalid/low.mp4']}},
                    {'PlayAddr': {'Width': 64, 'Height': 64, 'UrlList': [Fixture.asset_url + '/video/source.mp4']}}]}}
        response = {'webapp.video-detail': {'statusCode': 0, 'itemInfo': {'itemStruct': item}}}
        with patch.object(tiktok.TiktokExtractor, '_extract_rehydration_data', return_value=response):
            status, result = self.run_download(url='https://www.tiktok.com/@fixture/video/123')
        self.assertEqual(status, 0)
        self.assertEqual(result['videos'], 1)
        self.assertEqual(result['downloaded'], 1)
        files = list((Path(self.temp.name) / 'TikTok').rglob('*.mp4'))
        self.assertEqual(len(files), 1)
        self.assert_video_and_audio(files[0])


if __name__ == '__main__':
    unittest.main()
