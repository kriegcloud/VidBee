"""Offline signing regression: python -m unittest discover -s apps/desktop/test -p test_onlyfans.py."""
import re
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'vendor/yt-dlp'))
from yt_dlp import YoutubeDL
from yt_dlp.extractor.onlyfans import OnlyFansIE, _RulesError, _of_eval_rotation, _of_extract_sign_rules

FIXTURE = Path(__file__).parent / 'fixtures/onlyfans/sign-20260928.js.txt'


class OnlyFansSigningTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = FIXTURE.read_text()
        cls.rules = _of_extract_sign_rules(cls.js)

    def test_signatures_match_site_javascript(self):
        # Generated independently by the original webpack module, with a fixed
        # Date and synthetic authUserId=42. No account cookies or tokens used.
        for path, expected in (
            ('/api2/v2/users/medusa4prsdnt',
             '65870:56fcb26997df5ce2e5f495d64987b9304288b9d9:ad8:6aba7898'),
            ('/api2/v2/users/42/posts?limit=10&order=publish_date_desc',
             '65870:10141e16da35d0a08d32908162ab8e06e68fcdf6:b98:6aba7898'),
        ):
            with self.subTest(path=path):
                self.assertEqual(OnlyFansIE._sign(self.rules, path, '42', 1700000000123), expected)

    def test_swapped_decoder_arguments(self):
        js = re.sub(r'd\((\d+(?:e\d+)?),("(?:[^"\\]|\\.)*")\)', r'd(\2,\1)', self.js)
        js = js.replace('function d(W,n){return k(W-753,n)}',
                        'function d(W,n){return k(n-753,W)}')
        js = js.replace('return d(W- -774,n)', 'return d(n,W- -774)')
        self.assertEqual(_of_extract_sign_rules(js), self.rules)

    def test_equivalent_positive_offsets(self):
        js = self.js.replace('W- -358', 'W+358').replace('W- -774', 'W+774')
        self.assertEqual(_of_extract_sign_rules(js), self.rules)

    def test_suffix_helper_property(self):
        js = self.js.replace('const n={Zoamr:', 'const n={fixtureSuffix:d(1010,"sb#i"),Zoamr:')
        js = js.replace('}(i),d(1010,"sb#i")]', '}(i),n["fixtureSuffix"]]')
        self.assertEqual(_of_extract_sign_rules(js), self.rules)

    def test_invalid_rotation_fails(self):
        with self.assertRaisesRegex(_RulesError, 'rotation not solved'):
            _of_extract_sign_rules(self.js.replace('}(i,862452)', '}(i,1)'))

    def test_site_config_and_cache(self):
        ie = OnlyFansIE(YoutubeDL({'quiet': True}))
        ie._download_webpage = Mock(side_effect=[
            'const token="0123456789abcdef0123456789abcdef";'
            'h["app-token"]=token;h["x-of-rev"]="fixture";', self.js])
        root = 'https://static2.onlyfans.com/static/prod/f/fixture/'
        page = f'<script src="{root}app.js"></script><script src="{root}2313.js"></script>'
        with patch.object(OnlyFansIE, '_SITE_CONFIG_CACHE', {}):
            config = ie._get_site_config(page, 'medusa4prsdnt')
            self.assertEqual(config['rules'], self.rules)
            self.assertIs(ie._get_site_config(page, 'medusa4prsdnt'), config)
            self.assertEqual(ie._download_webpage.call_count, 2)
            self.assertEqual(ie._download_webpage.call_args.args[0], root + '2313.js')

    def test_rotation_arithmetic_rejects_code(self):
        self.assertEqual(_of_eval_rotation('-12 / 2 + 3 * (4 - -2)'), 12)
        for expression in ('f()', 'a.b', '[1][0]', '2 ** 3'):
            with self.subTest(expression=expression):
                with self.assertRaises(_RulesError):
                    _of_eval_rotation(expression)

    def test_reported_profile_url(self):
        self.assertTrue(OnlyFansIE.suitable('https://onlyfans.com/medusa4prsdnt/media'))


if __name__ == '__main__':
    unittest.main()
