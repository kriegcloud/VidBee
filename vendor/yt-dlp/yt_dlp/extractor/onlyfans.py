import ast
import glob
import hashlib
import json
import operator
import os
import random
import re
import sys
import time
import urllib.parse

from .common import InfoExtractor
from ..cookies import _get_chromium_based_browser_settings, _is_path
from ..networking.impersonate import ImpersonateTarget
from ..utils import (
    ExtractorError,
    clean_html,
    determine_ext,
    int_or_none,
    parse_iso8601,
    url_or_none,
)
from ..utils._leveldb import read_localstorage_value

# OnlyFans binds a session to the client identity that created it: the
# User-Agent/client-hints, the TLS fingerprint (via Cloudflare) and the
# anti-bot token x-bc (localStorage key "bcTokenSha", minted once per browser
# profile via cdn2.onlyfans.com/key/ and bound to the account server-side).
# Any API request carrying the session cookie with a mismatched identity or an
# unknown x-bc is treated as session theft: the API answers "Wrong user" and
# the session is revoked, logging out the user's real browser too.
# => Every request must present ONE consistent browser identity, and x-bc must
#    be the browser's stored token. Never mint a fresh one.
_OF_IMPERSONATE = ImpersonateTarget(client='chrome')

# Chrome major version claimed in the UA/client hints. Proven against the API
# with the chrome150 TLS impersonation target; bump as real browsers move on.
_OF_UA_VERSION = '153'

_OF_SEC_CH_UA_BRANDS = {
    'brave': '"Brave";v="{v}", "Not_A Brand";v="8", "Chromium";v="{v}"',
    'chrome': '"Chromium";v="{v}", "Google Chrome";v="{v}", "Not_A Brand";v="8"',
    'edge': '"Chromium";v="{v}", "Microsoft Edge";v="{v}", "Not_A Brand";v="8"',
}
_OF_SEC_CH_UA_DEFAULT = '"Chromium";v="{v}", "Not_A Brand";v="8"'

if sys.platform == 'darwin':
    _OF_UA_OS = 'Macintosh; Intel Mac OS X 10_15_7'
    _OF_UA_PLATFORM = 'macOS'
elif sys.platform in ('win32', 'cygwin'):
    _OF_UA_OS = 'Windows NT 10.0; Win64; x64'
    _OF_UA_PLATFORM = 'Windows'
else:
    _OF_UA_OS = 'X11; Linux x86_64'
    _OF_UA_PLATFORM = 'Linux'


class _RulesError(Exception):
    pass


def _of_b64_decode(data):
    # Custom base64 variant used by the site's JS string decoder.
    # The shift uses the post-increment counter, matching the JS original.
    alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/='
    out = bytearray()
    counter = 0
    accum = 0
    for char in data:
        idx = alphabet.find(char)
        if idx < 0:
            continue
        accum = (64 * accum + idx) if (counter % 4) else idx
        counter += 1
        if (counter - 1) % 4:
            out.append(255 & (accum >> (-2 * counter & 6)))
    return bytes(out).decode('utf-8')


def _of_rc4(data, key):
    box = list(range(256))
    j = 0
    for i in range(256):
        j = (j + box[i] + ord(key[i % len(key)])) % 256
        box[i], box[j] = box[j], box[i]
    i = j = 0
    out = []
    for char in data:
        i = (i + 1) % 256
        j = (j + box[i]) % 256
        box[i], box[j] = box[j], box[i]
        out.append(chr(ord(char) ^ box[(box[i] + box[j]) % 256]))
    return ''.join(out)


class _LinearExpr:
    """Symbolic linear form: sum(mults[k] * ord(hash[k])) + const."""

    def __init__(self, mults=None, const=0):
        self.mults = mults or {}
        self.const = const

    def __add__(self, other):
        mults = dict(self.mults)
        for k, v in other.mults.items():
            mults[k] = mults.get(k, 0) + v
        return _LinearExpr(mults, self.const + other.const)

    def __sub__(self, other):
        mults = dict(self.mults)
        for k, v in other.mults.items():
            mults[k] = mults.get(k, 0) - v
        return _LinearExpr(mults, self.const - other.const)

    def __mod__(self, other):
        if self.mults or other.mults:
            raise _RulesError('modulo on non-constant')
        return _LinearExpr(const=self.const % other.const)

    def __mul__(self, other):
        if self.mults or other.mults:
            raise _RulesError('multiplication on non-constant')
        return _LinearExpr(const=self.const * other.const)


_TOKEN_RE = re.compile(r'\s*(\d+|"[^"]*"|[A-Za-z_$][\w$]*|[\[\](),%+\-*])')


def _of_eval_checksum(text, ops, decode_o):
    """Symbolically evaluate the inlined checksum expression from the sign module.

    Grammar: helper calls n["<op>"](a, b), hash indexing W[k], W.length (40),
    method calls x["charCodeAt"](0) (identity here), Math["abs"](x), infix +/-/%.
    Returns (checksum_indexes, checksum_constant).
    """
    tokens = _TOKEN_RE.findall(text)
    if ''.join(tokens) != re.sub(r'\s', '', text):
        raise _RulesError('checksum expression tokenization failed')
    pos = [0]

    def peek():
        return tokens[pos[0]] if pos[0] < len(tokens) else None

    def next_():
        token = tokens[pos[0]]
        pos[0] += 1
        return token

    def expect(token):
        if next_() != token:
            raise _RulesError(f'expected {token}')

    def parse_expr():
        value = parse_mult()
        while peek() in ('+', '-'):
            op = next_()
            rhs = parse_mult()
            value = value + rhs if op == '+' else value - rhs
        return value

    def parse_mult():
        value = parse_postfix()
        while peek() in ('%', '*'):
            op = next_()
            rhs = parse_postfix()
            value = value % rhs if op == '%' else value * rhs
        return value

    def parse_postfix():
        value = parse_primary()
        while True:
            if peek() == '[':
                next_()
                index = parse_expr()
                expect(']')
                if value == 'HASH':
                    if isinstance(index, tuple) and index[0] == 'STR':
                        if index[1] != 'length':
                            raise _RulesError(f'unexpected hash property {index[1]}')
                        value = _LinearExpr(const=40)  # sha1 hex length
                    elif isinstance(index, _LinearExpr) and not index.mults:
                        value = _LinearExpr({index.const: 1}, 0)
                    else:
                        raise _RulesError('symbolic hash index')
                elif value == 'HELPERS':
                    value = ('HELPER', index)
                elif isinstance(value, tuple) and value[0] == 'MATH':
                    value = ('MATHPROP', index)
                elif isinstance(value, _LinearExpr) and isinstance(index, tuple) and index[0] == 'STR':
                    value = ('METHOD', value, index[1])
                else:
                    raise _RulesError('unexpected index expression')
            elif peek() == '(':
                next_()
                args = []
                if peek() != ')':
                    args.append(parse_expr())
                    while peek() == ',':
                        next_()
                        args.append(parse_expr())
                expect(')')
                value = apply_call(value, args)
            else:
                break
        return value

    def parse_primary():
        token = next_()
        if token == '-':
            return _LinearExpr(const=0) - parse_postfix()
        if token == '(':
            value = parse_expr()
            expect(')')
            return value
        if re.fullmatch(r'\d+', token):
            return _LinearExpr(const=int(token))
        if token.startswith('"'):
            return ('STR', json.loads(token))
        if token == 'W':
            return 'HASH'
        if token == 'n':
            return 'HELPERS'
        if token == 'Math':
            return ('MATH',)
        if token in ('o', 'c', 'i'):
            return ('DECODER', token)
        raise _RulesError(f'unexpected token {token}')

    def apply_call(func, args):
        if func == ('DECODER', 'o'):
            num, key = args
            if not isinstance(key, tuple) or key[0] != 'STR':
                raise _RulesError('bad decoder call')
            return ('STR', decode_o(num.const, key[1]))
        if isinstance(func, tuple) and func[0] == 'HELPER':
            name = func[1]
            if not isinstance(name, tuple) or name[0] != 'STR':
                raise _RulesError('helper name is not a string')
            op = ops.get(name[1])
            if op is None:
                raise _RulesError(f'unknown helper {name[1]}')
            left, right = args
            if op == '+':
                return left + right
            if op == '-':
                return left - right
            if op == '%':
                return left % right
            return left * right
        if isinstance(func, tuple) and func[0] == 'MATHPROP':
            return args[0]  # Math.abs is applied at formatting time
        if isinstance(func, tuple) and func[0] == 'METHOD':
            return func[1]  # charCodeAt(0)/toString(16): identity for the linear form
        raise _RulesError('unexpected call')

    result = parse_expr()
    if pos[0] != len(tokens) or not isinstance(result, _LinearExpr):
        raise _RulesError('checksum expression did not reduce to a linear form')
    indexes = []
    for k, count in result.mults.items():
        indexes.extend([k] * count)
    return indexes, result.const



def _of_eval_rotation(expression):
    """Evaluate only numeric arithmetic, never site-supplied Python or JS."""
    operators = {ast.Add: operator.add, ast.Sub: operator.sub,
                 ast.Mult: operator.mul, ast.Div: operator.truediv}

    def evaluate(node):
        if isinstance(node, ast.Constant) and type(node.value) is int:
            return node.value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = evaluate(node.operand)
            return -value if isinstance(node.op, ast.USub) else value
        if isinstance(node, ast.BinOp) and type(node.op) in operators:
            return operators[type(node.op)](evaluate(node.left), evaluate(node.right))
        raise _RulesError('unsupported rotation arithmetic')

    try:
        return evaluate(ast.parse(expression, mode='eval').body)
    except SyntaxError as error:
        raise _RulesError('invalid rotation arithmetic') from error


def _of_extract_sign_rules(js):
    """Extract the per-revision request-signing rules from the site's obfuscated
    sign chunk. The module ships a base64+RC4 string table that is rotated on load;
    this re-implements the decoder and statically evaluates the signing scheme."""
    # String table
    m = re.search(r'function \w+\(\)\{const \w+=\[((?:"(?:[^"\\]|\\.)*",?)+)\]', js)
    if not m:
        raise _RulesError('string table not found')
    table = [json.loads(f'"{s}"') for s in re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))]

    # Decoder wrappers change argument order and signed offsets between revisions.
    m = re.search(r'function (\w+)\((\w+),\w+\)\{\2-=(\d+);', js)
    if not m:
        raise _RulesError('decoder not found')
    decoder, off_i = m.group(1), int(m.group(3))
    wrappers = {}
    for m in re.finditer(
            r'function (\w+)\((\w+),(\w+)\)\{return (\w+)\(([^,{}]+),([^,{}]+)\)\}', js):
        name, first, second, callee, left, right = m.groups()
        wrappers[name] = (first, second, callee, left, right)

    def decode(name, args, arr, seen=()):
        if name == decoder:
            idx, key = args
            if not isinstance(idx, int) or not isinstance(key, str) or not 0 <= idx - off_i < len(arr):
                raise _RulesError('invalid decoder arguments')
            return _of_rc4(_of_b64_decode(arr[idx - off_i]), key)
        if name not in wrappers or name in seen:
            raise _RulesError('unknown decoder wrapper')
        first, second, callee, left, right = wrappers[name]
        values = dict(zip((first, second), args))

        def argument(expr):
            m = re.fullmatch(r'(\w+)(?:\s*([+-])\s*(-?\s*\d+))?', expr)
            if not m or m[1] not in values:
                raise _RulesError('unsupported wrapper argument')
            value = values[m[1]]
            if m[2]:
                offset = int(m[3].replace(' ', ''))
                value += offset if m[2] == '+' else -offset
            return value

        return decode(callee, (argument(left), argument(right)), arr, (*seen, name))

    number = r'-?\d+(?:e\+?\d+)?'
    literal = rf'(?:"(?:[^"\\]|\\.)*"|{number})'
    call_re = re.compile(rf'(\w+)\(({literal}),\s*({literal})\)')

    def decode_calls(text, arr):
        def substitute(m):
            if m[1] != decoder and m[1] not in wrappers:
                return m[0]
            args = tuple(json.loads(v) if v.startswith('"') else int(float(v)) for v in (m[2], m[3]))
            return json.dumps(decode(m[1], args, arr))
        return call_re.sub(substitute, text)

    # Solve the rotation with the public module's arithmetic self-check.
    m = re.search(r'if\(([-+]?parseInt\(.{50,2000}?)===\w+\)break', js, re.S)
    target_match = re.search(r'\}\(\w+,(\d+)\)', js)
    if not m or not target_match:
        raise _RulesError('rotation expression not found')
    rotation_expr, target = m[1], int(target_match[1])
    for _ in range(len(table)):
        try:
            expr = decode_calls(rotation_expr, table)
            def parse_int(m):
                value = re.match(r'\s*([+-]?\d+)', json.loads(m[1]))
                if not value:
                    raise _RulesError('non-numeric rotation value')
                return value[1]
            expr = re.sub(r'parseInt\(("(?:[^"\\]|\\.)*")\)', parse_int, expr)
            if re.fullmatch(r'[\d\s+\-*/()]+', expr) and _of_eval_rotation(expr) == target:
                break
        except (_RulesError, UnicodeDecodeError, IndexError, TypeError, ZeroDivisionError):
            pass
        table.append(table.pop(0))
    else:
        raise _RulesError('string table rotation not solved')

    js = decode_calls(js, table)
    if not re.search(r'\["time"\]=\+new Date', js):
        raise _RulesError('time key check failed')

    consts = {name: json.loads(value) for name, value in
              re.findall(r'(\w+):("(?:[^"\\]|\\.)*")', js)}
    value_pattern = r'(?:"(?:[^"\\]|\\.)*"|\w+\["\w+"\])'

    def string_value(value):
        if value.startswith('"'):
            return json.loads(value)
        key = re.fullmatch(r'\w+\["(\w+)"\]', value)[1]
        if key not in consts:
            raise _RulesError('signing constant not found')
        return consts[key]

    m = re.search(
        rf'\[({value_pattern}),\w+\["time"\],\w+,\w+\|\|0\]\["join"\]\("\\n"\)', js)
    if not m:
        raise _RulesError('static_param anchor not found')
    static_param = string_value(m[1])
    m = re.search(rf'return \w+\["sign"\]=\[({value_pattern}),\w+,function', js)
    if not m:
        raise _RulesError('prefix anchor not found')
    prefix = string_value(m[1])
    m = re.search(rf'\}}\(\w+\),({value_pattern})\]\["join"\]\(":"\)', js)
    if not m:
        raise _RulesError('suffix anchor not found')
    suffix = string_value(m[1])

    # Arithmetic helper map: name: function(a,b){return a<op>b}
    ops = dict(re.findall(r'(\w+):function\(\w+,\w+\)\{return \w+\s*([+\-*%])\s*\w+\}', js))

    # Checksum: symbolically evaluate the Math.abs(...) argument of the inlined IIFE
    m = re.search(r'return\s+Math\["abs"\]\(', js)
    if not m:
        raise _RulesError('checksum anchor not found')
    expr_start = m.end()
    depth = 1
    i = expr_start
    while depth > 0 and i < len(js):
        char = js[i]
        if char == '"':
            j = i + 1
            while j < len(js) and js[j] != '"':
                j += 2 if js[j] == '\\' else 1
            i = j + 1
            continue
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        i += 1
    if depth:
        raise _RulesError('unbalanced checksum expression')
    tail = js[i:i + 60]
    if not re.match(r'\["toString"\]\(16\)', tail):
        raise _RulesError('toString check failed')

    checksum_indexes, checksum_constant = _of_eval_checksum(js[expr_start:i - 1], ops, None)
    return {
        'static_param': static_param,
        'prefix': prefix,
        'suffix': suffix,
        'checksum_indexes': checksum_indexes,
        'checksum_constant': checksum_constant,
    }


_OF_RESERVED_PROFILES = frozenset((
    'api', 'api2', 'banking', 'card', 'chats', 'collections', 'credits',
    'facebook', 'help', 'instagram', 'live', 'login', 'mentions', 'messages',
    'my', 'notifications', 'oauth', 'payouts', 'posts', 'privacy', 'promotions',
    'q', 'queue', 'referrals', 'reset', 'search', 'settings', 'signup',
    'statements', 'statistics', 'stories', 'streaming', 'subscribers',
    'subscriptions', 'tagged', 'terms', 'tracking', 'trials', 'twitter',
    'users', 'vault',
))

_OF_PAGE_LIMIT = 10
_OF_PAGE_SLEEP = (1.2, 2.8)
_OF_MAX_PAGES = 1000


class OnlyFansIE(InfoExtractor):
    _VALID_URL = r'''(?x)
        https?://(?:www\.)?onlyfans\.com/
        (?:
            my/chats/chat/(?P<chat_id>\d+)
                (?:/(?P<chat_section>gallery)
                    (?:/(?P<chat_tab>opened|purchased|photos|videos))?
                )?
                (?:/media/(?P<chat_media_id>\d+))?
          | (?P<id>\d+)/(?P<username>[\w.-]+)
                (?:/media/(?P<media_id>\d+))?
          | (?P<profile>(?!my(?:/|$))[\w.-]+)
                (?:/(?P<profile_tab>media|photos|videos))?
        )
        /?(?:[?#].*)?$
    '''
    _TESTS = [{
        'url': 'https://onlyfans.com/2669829379/kenzeygrey',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/2669829379/kenzeygrey/media/3743089366',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/kenzeygrey',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/kenzeygrey/media',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/kenzeygrey/photos',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/kenzeygrey/videos',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/my/chats/chat/123456',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/my/chats/chat/123456/gallery',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/my/chats/chat/123456/gallery/opened',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/my/chats/chat/123456/gallery/purchased',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/my/chats/chat/123456/gallery/photos',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/my/chats/chat/123456/gallery/videos',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/my/chats/chat/123456/?firstId=1',
        'only_matching': True,
    }, {
        'url': 'https://onlyfans.com/my/chats/chat/123456/media/99',
        'only_matching': True,
    }]

    _CDN_BASE = 'https://cdn2.onlyfans.com'
    _SITE_CONFIG_CACHE = {}

    def _browser_headers(self, extra=None):
        # One consistent identity on every request; brand follows the browser
        # the session cookies come from (unknown -> plain Chromium)
        brand_tpl = _OF_SEC_CH_UA_BRANDS.get(self._browser_name or '', _OF_SEC_CH_UA_DEFAULT)
        headers = {
            'User-Agent': f'Mozilla/5.0 ({_OF_UA_OS}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{_OF_UA_VERSION}.0.0.0 Safari/537.36',
            'Sec-Ch-Ua': brand_tpl.format(v=_OF_UA_VERSION),
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': f'"{_OF_UA_PLATFORM}"',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        headers.update(extra or {})
        return headers

    _browser_name = None

    def _resolve_bc_token(self, video_id):
        # Explicit override, also the only option for --cookies <file> flows:
        # --extractor-args "onlyfans:x_bc=<token>"
        token = self._configuration_arg('x_bc', [None])[0]
        if token:
            return token

        spec = self.get_param('cookiesfrombrowser')
        browser_dirs = []
        explicit_profile = None
        if spec:
            browser, profile = spec[0], spec[1]
            self._browser_name = browser
            try:
                browser_dirs.append(_get_chromium_based_browser_settings(browser)['browser_dir'])
            except KeyError:
                pass
            explicit_profile = profile
        else:
            # Cookie-file flow: scan every known Chromium-based browser
            for name in ('brave', 'chrome', 'chromium', 'edge', 'vivaldi', 'opera', 'whale'):
                try:
                    browser_dirs.append(_get_chromium_based_browser_settings(name)['browser_dir'])
                except KeyError:
                    continue

        profile_dirs = []
        for browser_dir in browser_dirs:
            if explicit_profile is None:
                # Profiles are subdirectories (Default, Profile 1, ...); some
                # browsers (e.g. Opera) store data directly in the root
                profile_dirs.extend(glob.glob(os.path.join(glob.escape(browser_dir), '*')))
                profile_dirs.append(browser_dir)
            elif _is_path(explicit_profile):
                profile_dirs.append(explicit_profile)
            else:
                profile_dirs.append(os.path.join(browser_dir, explicit_profile))

        for profile_dir in profile_dirs:
            token = read_localstorage_value(profile_dir, 'bcTokenSha')
            if token:
                if not spec:
                    self.report_warning(
                        f'Using bcTokenSha from {profile_dir}; '
                        f'pass --extractor-args "onlyfans:x_bc=<token>" to select it explicitly')
                return token
        return None

    def _get_site_config(self, webpage, video_id):
        scripts = re.findall(r'src=["\']?(https://static2\.onlyfans\.com/static/prod/f/([\w-]+)/[^"\'\s>]+\.js)', webpage)
        if not scripts:
            raise ExtractorError('Unable to locate site scripts', expected=False)
        rev = scripts[0][1]
        config = self._SITE_CONFIG_CACHE.get(rev)
        if config:
            return config

        app_js_url = next((u for u, _ in scripts if u.endswith('/app.js')), None)
        if not app_js_url:
            raise ExtractorError('Unable to locate app.js')
        app_js = self._download_webpage(
            app_js_url, video_id, note='Downloading app bundle',
            headers=self._browser_headers(),
            impersonate=_OF_IMPERSONATE, require_impersonation=True)
        token_var = self._search_regex(r'\["app-token"\]\s*=\s*(\w+)', app_js, 'app-token var')
        app_token = self._search_regex(
            r'\b%s\s*=\s*"([0-9a-f]{32})"' % re.escape(token_var), app_js, 'app-token')
        x_of_rev = self._search_regex(r'\["x-of-rev"\]\s*=\s*"([^"]+)"', app_js, 'x-of-rev')

        # The sign module ships in a numbered (non-vendor) chunk; scan candidates first
        urls = [u for u, _ in scripts]
        urls.sort(key=lambda u: 0 if re.search(r'/\d+\.js$', u) else 1)
        rules = None
        for js_url in urls[:12]:
            js = self._download_webpage(
                js_url, video_id, note='Downloading sign chunk', fatal=False,
                headers=self._browser_headers(),
                impersonate=_OF_IMPERSONATE, require_impersonation=True)
            if not js or '+new Date' not in js:
                continue
            if not re.search(r'function \w+\(\)\{const \w+=\["', js):
                continue
            try:
                rules = _of_extract_sign_rules(js)
                break
            except _RulesError:
                continue
        if not rules:
            raise ExtractorError('Unable to extract request signing rules (site changed?)')

        config = {'rev': rev, 'app_token': app_token, 'x_of_rev': x_of_rev, 'rules': rules}
        self._SITE_CONFIG_CACHE[rev] = config
        return config

    @staticmethod
    def _sign(rules, path, user_id, time_ms):
        msg = f'{rules["static_param"]}\n{time_ms}\n{path}\n{user_id}'
        digest = hashlib.sha1(msg.encode()).hexdigest()
        checksum = sum(ord(digest[i]) for i in rules['checksum_indexes']) + rules['checksum_constant']
        return f'{rules["prefix"]}:{digest}:{abs(checksum):x}:{rules["suffix"]}'

    def _call_api(self, path, video_id, config, user_id, referer, x_bc, note='Downloading JSON metadata', fatal=True):
        time_ms = int(time.time() * 1000)
        # x-hash is per-user and safe to mint fresh; cache it with the config
        # to avoid a burst of token requests on every extraction
        x_hash = config.setdefault('x_hash', {}).get(user_id)
        if x_hash is None:
            resp = self._download_webpage(
                f'{self._CDN_BASE}/hash/?u={user_id}', video_id, note='Fetching hash token',
                fatal=False, headers=self._browser_headers({'Accept': '*/*'}),
                impersonate=_OF_IMPERSONATE, require_impersonation=True)
            x_hash = resp.strip() if resp else None
            config['x_hash'][user_id] = x_hash
        headers = self._browser_headers({
            'Accept': 'application/json, text/plain, */*',
            'app-token': config['app_token'],
            'user-id': user_id,
            'time': str(time_ms),
            'sign': self._sign(config['rules'], path, user_id, time_ms),
            'x-of-rev': config['x_of_rev'],
            'x-bc': x_bc,
            'Referer': referer,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
        })
        if x_hash:
            headers['x-hash'] = x_hash
        return self._download_json(
            f'https://onlyfans.com{path}', video_id, headers=headers,
            note=note, fatal=fatal, expected_status=[400, 401, 403, 404],
            impersonate=_OF_IMPERSONATE, require_impersonation=True)

    def _extract_video(self, media, post, username):
        media_id = str(media.get('id'))
        formats = []
        files = media.get('files') or {}

        full = files.get('full') or {}
        if url_or_none(full.get('url')):
            formats.append({
                'url': full['url'],
                'format_id': 'full',
                'width': int_or_none(full.get('width')),
                'height': int_or_none(full.get('height')),
                'impersonate': _OF_IMPERSONATE,
                'http_headers': self._browser_headers({'Referer': 'https://onlyfans.com/'}),
            })
        else:
            sources = media.get('videoSources')
            if isinstance(sources, dict):
                for res, url in sources.items():
                    if url_or_none(url):
                        formats.append({
                            'url': url,
                            'format_id': f'source-{res}',
                            'height': int_or_none(res),
                            'impersonate': _OF_IMPERSONATE,
                            'http_headers': self._browser_headers({'Referer': 'https://onlyfans.com/'}),
                        })

        if not formats:
            return None

        best = max(
            formats,
            key=lambda fmt: (
                1 if fmt.get('format_id') == 'full' else 0,
                int_or_none(fmt.get('height')) or 0,
            ))
        headers = self._browser_headers({'Referer': 'https://onlyfans.com/'})
        info = {
            'id': media_id,
            'title': clean_html(post.get('text')) or f'OnlyFans post {post.get("id")}',
            'url': best['url'],
            'ext': determine_ext(best['url'], default_ext='mp4'),
            'duration': int_or_none(media.get('duration')),
            'thumbnail': url_or_none((files.get('preview') or {}).get('url')),
            'uploader': username,
            'timestamp': parse_iso8601(post.get('postedAt') or post.get('createdAt')),
            'formats': formats,
            # Media requests carry session cookies too; keep the same identity
            'impersonate': _OF_IMPERSONATE,
            'http_headers': headers,
        }
        return info

    def _extract_photo(self, media, post, username):
        files = media.get('files') or {}
        chosen = {}
        photo_url = None
        for key in ('full', 'source'):
            candidate = files.get(key) or {}
            photo_url = url_or_none(candidate.get('url'))
            if photo_url:
                chosen = candidate
                break
        if not photo_url:
            photo_url = url_or_none(media.get('src'))
        if not photo_url:
            return None
        headers = self._browser_headers({'Referer': 'https://onlyfans.com/'})
        return {
            'id': str(media.get('id')),
            'title': clean_html(post.get('text')) or f'OnlyFans post {post.get("id")}',
            'url': photo_url,
            'ext': determine_ext(photo_url, default_ext='jpg'),
            'width': int_or_none(chosen.get('width')),
            'height': int_or_none(chosen.get('height')),
            'thumbnail': url_or_none((files.get('preview') or {}).get('url')),
            'uploader': username,
            'timestamp': parse_iso8601(post.get('postedAt') or post.get('createdAt')),
            'impersonate': _OF_IMPERSONATE,
            'http_headers': headers,
            'formats': [{
                'url': photo_url,
                'ext': determine_ext(photo_url, default_ext='jpg'),
                'format_id': 'full',
                'width': int_or_none(chosen.get('width')),
                'height': int_or_none(chosen.get('height')),
                'impersonate': _OF_IMPERSONATE,
                'http_headers': headers,
            }],
        }

    def _raise_api_error(self, payload):
        message = None
        if isinstance(payload, dict):
            error = payload.get('error')
            if isinstance(error, dict):
                message = error.get('message')
            elif isinstance(error, str):
                message = error
        raise ExtractorError(
            f'OnlyFans API error: {message or "unknown"} (the session may have been revoked; '
            f'log in again in your browser and retry with fresh cookies)',
            expected=True)

    def _api_items(self, payload):
        if payload is None:
            return []
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if not isinstance(payload, dict):
            return []
        if 'error' in payload:
            self._raise_api_error(payload)
        for key in ('list', 'items', 'data', 'media', 'messages', 'posts'):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        return []

    def _page_sleep(self, video_id):
        arg = (self._configuration_arg('page_sleep', [None])[0] or '').strip().lower()
        if arg in ('0', 'false', 'no'):
            return
        delay = random.uniform(*_OF_PAGE_SLEEP)
        self._sleep(delay, video_id, '%(video_id)s: Waiting %(timeout).1f seconds before the next OnlyFans page')

    def _open_session(self, page_url, video_id):
        cookies = self._get_cookies('https://onlyfans.com')
        auth_id = cookies.get('auth_id')
        if not auth_id or not cookies.get('sess'):
            self.raise_login_required(
                'OnlyFans requires an active session; pass cookies with --cookies',
                method='cookies')
        user_id = auth_id.value
        x_bc = self._resolve_bc_token(video_id)
        if not x_bc:
            raise ExtractorError(
                'OnlyFans requires the anti-bot token (bcTokenSha) stored in the browser '
                'profile that owns the session. Use --cookies-from-browser with the browser '
                'you are logged in with, or pass --extractor-args "onlyfans:x_bc=<token>" '
                '(browser DevTools console: localStorage.getItem("bcTokenSha"))',
                expected=True)
        webpage = self._download_webpage(
            page_url, video_id, note='Downloading page',
            headers=self._browser_headers(),
            impersonate=_OF_IMPERSONATE, require_impersonation=True)
        config = self._get_site_config(webpage, video_id)
        return config, user_id, x_bc

    def _media_thumbnail(self, media):
        files = media.get('files') or {}
        for key in ('preview', 'thumb', 'squarePreview', 'miniPreview'):
            thumb = url_or_none((files.get(key) or {}).get('url'))
            if thumb:
                return thumb
        return None

    def _video_is_drm(self, media):
        files = media.get('files') or {}
        if url_or_none((files.get('full') or {}).get('url')):
            return False
        sources = media.get('videoSources') or {}
        if isinstance(sources, dict) and any(url_or_none(url) for url in sources.values()):
            return False
        manifest = (files.get('drm') or {}).get('manifest') or {}
        return bool(url_or_none(manifest.get('hls')) or url_or_none(manifest.get('dash')))

    def _viewable_media(self, container):
        media_list = container.get('media') if isinstance(container, dict) else container
        if not isinstance(media_list, list):
            return []
        return [
            media for media in media_list
            if isinstance(media, dict) and media.get('canView', True)]

    def _media_kind(self, media):
        media_type = media.get('type')
        if media_type == 'video':
            # Encoded/CDM videos are skipped until analog capture is wired in
            # a later pass. Inventory only photos and clear MP4s.
            return None if self._video_is_drm(media) else 'video'
        if media_type in ('photo', 'gif'):
            return 'photo'
        return None

    def _playlist_entry_from_media(self, media, source, username, post_id=None, chat_id=None):
        media_id = str(media.get('id') or '')
        kind = self._media_kind(media)
        if not media_id or not kind:
            return None
        info = self._extract_media_item(media, source, username)
        if not info:
            return None
        if chat_id:
            webpage_url = f'https://onlyfans.com/my/chats/chat/{chat_id}/media/{media_id}'
        else:
            webpage_url = f'https://onlyfans.com/{post_id}/{username}/media/{media_id}'
        if info.get('formats'):
            best = max(
                info['formats'],
                key=lambda fmt: (
                    1 if fmt.get('format_id') == 'full' else 0,
                    int_or_none(fmt.get('height')) or 0,
                ))
            info['url'] = best['url']
            info.setdefault('ext', determine_ext(best['url'], default_ext='mp4' if kind == 'video' else 'jpg'))
        info['webpage_url'] = webpage_url
        info['original_url'] = webpage_url
        info['thumbnail'] = info.get('thumbnail') or self._media_thumbnail(media)
        info['media_type'] = kind
        return info

    def _entries_from_container(self, container, username, post_id=None, chat_id=None):
        entries = []
        for media in self._viewable_media(container):
            entry = self._playlist_entry_from_media(
                media, container, username, post_id=post_id, chat_id=chat_id)
            if entry:
                entries.append(entry)
        return entries

    def _extract_media_item(self, media, source, username):
        media_type = media.get('type')
        if media_type == 'video':
            return self._extract_video(media, source, username)
        if media_type in ('photo', 'gif'):
            photo = self._extract_photo(media, source, username)
            if photo:
                return photo
        return None

    def _iter_pages(self, video_id, config, user_id, referer, x_bc, build_path, cursor_from):
        cursor = None
        seen = set()
        max_pages_arg = (self._configuration_arg('max_pages', [None])[0] or '').strip()
        max_pages = int(max_pages_arg) if max_pages_arg.isdigit() else _OF_MAX_PAGES
        max_pages = max(1, min(max_pages, _OF_MAX_PAGES))
        for page in range(max_pages):
            path = build_path(cursor)
            payload = self._call_api(
                path, video_id, config, user_id, referer, x_bc,
                note=f'Downloading page {page + 1}')
            items = self._api_items(payload)
            fresh = []
            for item in items:
                item_id = item.get('id')
                if item_id in seen:
                    continue
                seen.add(item_id)
                fresh.append(item)
            if not fresh:
                break
            yield from fresh
            has_more = payload.get('hasMore') if isinstance(payload, dict) else None
            next_cursor = None
            if isinstance(payload, dict):
                next_cursor = payload.get('nextLastId') or payload.get('lastId')
            if next_cursor is None and items:
                next_cursor = cursor_from(items[-1])
            if has_more is False:
                break
            if not next_cursor or next_cursor == cursor:
                break
            if has_more is None and len(items) < _OF_PAGE_LIMIT:
                break
            cursor = next_cursor
            self._page_sleep(video_id)

    def _extract_post_gallery(self, post_id, username, media_id, config, user_id, x_bc):
        post_url = f'https://onlyfans.com/{post_id}/{username}'
        post = self._call_api(
            f'/api2/v2/posts/{post_id}?skip_users=all', post_id, config, user_id, post_url, x_bc,
            note='Calling post API')
        if not isinstance(post, dict) or 'error' in post:
            self._raise_api_error(post)
        media_list = self._viewable_media(post)
        if media_id:
            media = next((item for item in media_list if str(item.get('id')) == media_id), None)
            if not media:
                raise ExtractorError('Media not found in this post', expected=True, video_id=media_id)
            info = self._extract_media_item(media, post, username)
            if info:
                return info
            self.raise_no_formats('No viewable media found', expected=True, video_id=media_id)
        entries = self._entries_from_container(post, username, post_id=post_id)
        if not entries:
            self.raise_no_formats(
                'No viewable media found (the post may be paywalled)',
                expected=True, video_id=post_id)
        return self.playlist_result(
            entries, post_id, clean_html(post.get('text')), uploader=username)

    def _profile_query(self, tab):
        extra = ''
        if tab == 'photos':
            extra = '&format=photo'
        elif tab == 'videos':
            extra = '&format=video'
        return extra

    def _extract_profile(self, username, tab, config, user_id, x_bc):
        if username.lower() in _OF_RESERVED_PROFILES:
            raise ExtractorError(f'Unsupported OnlyFans path: /{username}', expected=True)
        page_url = f'https://onlyfans.com/{username}' + (f'/{tab}' if tab else '')
        profile = self._call_api(
            f'/api2/v2/users/{username}', username, config, user_id, page_url, x_bc,
            note='Fetching profile')
        if not isinstance(profile, dict) or 'error' in profile or not profile.get('id'):
            self._raise_api_error(profile)
        creator_id = str(profile['id'])
        display_name = profile.get('name') or username
        extra = self._profile_query(tab)

        def build_path(cursor):
            path = (
                f'/api2/v2/users/{creator_id}/posts?limit={_OF_PAGE_LIMIT}'
                f'&order=publish_date_desc&skip_users=all{extra}')
            if cursor:
                path += f'&beforePublishTime={urllib.parse.quote(str(cursor))}'
            return path

        def cursor_from(post):
            return post.get('postedAtPrecise') or post.get('postedAt') or post.get('id')

        entries = []
        for post in self._iter_pages(
                username, config, user_id, page_url, x_bc, build_path, cursor_from):
            entries.extend(self._entries_from_container(
                post, username, post_id=str(post.get('id') or '')))
        if not entries:
            self.raise_no_formats('No viewable media found on this profile', expected=True, video_id=username)
        title_suffix = {'photos': 'photos', 'videos': 'videos', 'media': 'media'}.get(tab, 'posts')
        return self.playlist_result(
            entries, username, f'{display_name} ({title_suffix})', uploader=username)

    def _chat_media_query(self, tab):
        if tab == 'photos':
            return '&type=photos'
        if tab == 'videos':
            return '&type=videos'
        if tab == 'opened':
            return '&opened=1'
        if tab == 'purchased':
            return '&purchased=1'
        return ''

    def _extract_chat(self, chat_id, section, tab, media_id, config, user_id, x_bc):
        referer = f'https://onlyfans.com/my/chats/chat/{chat_id}'
        if section:
            referer += '/gallery' + (f'/{tab}' if tab else '')
        chat = self._call_api(
            f'/api2/v2/chats/{chat_id}?skip_users=all', chat_id, config, user_id, referer, x_bc,
            note='Fetching chat', fatal=False)
        with_user = (chat or {}).get('withUser') if isinstance(chat, dict) else None
        username = (with_user or {}).get('username') or chat_id
        title = (with_user or {}).get('name') or f'Chat {chat_id}'

        if media_id:
            return self._extract_chat_media(
                chat_id, media_id, username, config, user_id, x_bc, referer)

        entries = []
        if section == 'gallery':
            extra = self._chat_media_query(tab)

            def build_path(cursor):
                path = (
                    f'/api2/v2/chats/{chat_id}/media?limit={_OF_PAGE_LIMIT}'
                    f'&skip_users=all{extra}')
                if cursor:
                    path += f'&lastId={urllib.parse.quote(str(cursor))}'
                return path

            def cursor_from(item):
                return item.get('id')

            for item in self._iter_pages(
                    chat_id, config, user_id, referer, x_bc, build_path, cursor_from):
                nested = self._entries_from_container(item, username, chat_id=chat_id)
                if nested:
                    entries.extend(nested)
                else:
                    entry = self._playlist_entry_from_media(
                        item, item, username, chat_id=chat_id)
                    if entry:
                        entries.append(entry)
        else:
            def build_path(cursor):
                path = (
                    f'/api2/v2/chats/{chat_id}/messages?limit={_OF_PAGE_LIMIT}'
                    f'&order=desc&skip_users=all')
                if cursor:
                    path += f'&id={urllib.parse.quote(str(cursor))}'
                return path

            def cursor_from(item):
                return item.get('id')

            for message in self._iter_pages(
                    chat_id, config, user_id, referer, x_bc, build_path, cursor_from):
                entries.extend(self._entries_from_container(
                    message, username, chat_id=chat_id))

        if not entries:
            self.raise_no_formats(
                'No downloadable photos or videos found (encoded videos are skipped)',
                expected=True, video_id=chat_id)
        suffix = tab or ('gallery' if section else 'messages')
        return self.playlist_result(entries, chat_id, f'{title} ({suffix})', uploader=username)

    def _extract_chat_media(self, chat_id, media_id, username, config, user_id, x_bc, referer):
        extra = self._chat_media_query(None)

        def build_path(cursor):
            path = (
                f'/api2/v2/chats/{chat_id}/media?limit={_OF_PAGE_LIMIT}'
                f'&skip_users=all{extra}')
            if cursor:
                path += f'&lastId={urllib.parse.quote(str(cursor))}'
            return path

        def cursor_from(item):
            return item.get('id')

        for item in self._iter_pages(
                chat_id, config, user_id, referer, x_bc, build_path, cursor_from):
            candidates = self._viewable_media(item)
            if not candidates and isinstance(item, dict):
                candidates = [item]
            media = next((entry for entry in candidates if str(entry.get('id')) == str(media_id)), None)
            if not media:
                continue
            info = self._extract_media_item(media, item, username)
            if info:
                return info
            self.raise_no_formats(
                'No direct photo or MP4 found for this item (encoded videos are skipped)',
                expected=True, video_id=media_id)
        raise ExtractorError('Chat media not found in this gallery', expected=True, video_id=media_id)

    def _real_extract(self, url):
        mobj = self._match_valid_url(url)
        chat_id = mobj.group('chat_id')
        post_id = mobj.group('id')
        username = mobj.group('username')
        media_id = mobj.group('media_id')
        profile = mobj.group('profile')
        profile_tab = mobj.group('profile_tab')
        chat_section = mobj.group('chat_section')
        chat_tab = mobj.group('chat_tab')
        chat_media_id = mobj.group('chat_media_id')

        if chat_id:
            page_url = f'https://onlyfans.com/my/chats/chat/{chat_id}'
            video_id = chat_id
        elif post_id:
            page_url = f'https://onlyfans.com/{post_id}/{username}'
            video_id = post_id
        else:
            if not profile or profile.lower() in _OF_RESERVED_PROFILES:
                raise ExtractorError('Unsupported OnlyFans URL', expected=True)
            page_url = f'https://onlyfans.com/{profile}'
            video_id = profile

        config, user_id, x_bc = self._open_session(page_url, video_id)
        if chat_id:
            return self._extract_chat(
                chat_id, chat_section, chat_tab, chat_media_id, config, user_id, x_bc)
        if post_id:
            return self._extract_post_gallery(post_id, username, media_id, config, user_id, x_bc)
        return self._extract_profile(profile, profile_tab, config, user_id, x_bc)
