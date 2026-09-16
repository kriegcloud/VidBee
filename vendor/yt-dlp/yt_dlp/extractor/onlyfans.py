import hashlib
import json
import re
import time

from .common import InfoExtractor
from ..utils import (
    ExtractorError,
    clean_html,
    int_or_none,
    parse_iso8601,
    url_or_none,
)


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


def _of_extract_sign_rules(js):
    """Extract the per-revision request-signing rules from the site's obfuscated
    sign chunk. The module ships a base64+RC4 string table that is rotated on load;
    this re-implements the decoder and statically evaluates the signing scheme."""
    # String table
    m = re.search(r'function \w+\(\)\{const \w+=\[((?:"(?:[^"\\]|\\.)*",?)+)\]', js)
    if not m:
        raise _RulesError('string table not found')
    table = [json.loads(f'"{s}"') for s in re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))]

    # Decoder offset: function i(W,n){W-=487;
    m = re.search(r'function \w+\((\w+),\w+\)\{\1-=(\d+);', js)
    if not m:
        raise _RulesError('decoder not found')
    off_i = int(m.group(2))

    # Rotation wrapper t and target from the self-defending IIFE
    m = re.search(r'!function\(\w+,\w+\)\{const \w+=\w+\(\);function (\w+)\(\w+,\w+\)'
                  r'\{return \w+\(\w+-\s*-\s*(\d+),\w+\)\}', js)
    if not m:
        raise _RulesError('rotation wrapper not found')
    name_t, off_t = m.group(1), int(m.group(2))
    m = re.search(r'\}\(\w+,(\d+)\)', js)
    if not m:
        raise _RulesError('rotation target not found')
    target = int(m.group(1))

    # Module-level wrapper c (same shape as t; pick the other one)
    name_c = off_c = None
    for mm in re.finditer(r'function (\w+)\((\w+),(\w+)\)\{return \w+\(\3-\s*-\s*(\d+),\2\)\}', js):
        if mm.group(1) != name_t:
            name_c, off_c = mm.group(1), int(mm.group(4))
            break
    if name_c is None:
        raise _RulesError('c wrapper not found')

    def dec_i(idx, key, arr):
        return _of_rc4(_of_b64_decode(arr[idx - off_i]), key)

    # Solve the array rotation using the module's own self-check expression
    m = re.search(r'if\((parseInt\(.{50,2000}?)\)\s*break', js, re.S)
    if not m:
        raise _RulesError('rotation expression not found')
    rotation_expr = m.group(1)

    def try_rotation(arr):
        def substitute(mm):
            value = dec_i(int(mm.group(2)) + off_t, mm.group(1), arr)
            pm = re.match(r'\s*([+-]?\d+)', value)  # JS parseInt is lenient
            if not pm:
                raise _RulesError('non-numeric in rotation expression')
            return pm.group(1)
        try:
            expr = re.sub(r'parseInt\(\w+\("([^"]+)",\s*(-?\d+)\)\)', substitute, rotation_expr)
        except (_RulesError, UnicodeDecodeError, IndexError, KeyError):
            return False
        expr = re.sub(r'===\s*\w+\s*$', '', expr)
        if not re.fullmatch(r'[\d\s+\-*/()]+', expr):
            return False
        try:
            return eval(expr, {'__builtins__': {}}, {}) == target  # noqa: S307 (arithmetic only)
        except Exception:
            return False

    for _ in range(len(table)):
        if try_rotation(table):
            break
        table.append(table.pop(0))
    else:
        raise _RulesError('string table rotation not solved')

    def dec_c(key, num):
        return dec_i(num + off_c, key, table)

    # Checksum-inner wrapper o: function o(W,n){return c(n,W- -116)}
    mo = re.search(
        r'function (\w+)\((\w+),(\w+)\)\{return %s\(\3,\2-\s*-\s*(\d+)\)\}' % re.escape(name_c), js)
    if not mo:
        raise _RulesError('o wrapper not found')
    name_o, off_o = mo.group(1), int(mo.group(4))

    def dec_o(num, key):
        return dec_c(key, num + off_o)

    # Sanity checks on known plaintexts
    m = re.search(r'\[\s*%s\("([^"]+)",\s*(\d+)\)\]\s*=\s*\+new Date' % re.escape(name_c), js)
    if not m or dec_c(m.group(1), int(m.group(2))) != 'time':
        raise _RulesError('time key check failed')

    # static_param: first element of the array joined with "\n" for the sha1 input
    m = re.search(
        r'\[\s*%s\("([^"]+)",\s*(\d+)\)\s*,\s*\w+\[[^\]]*\]\s*,\s*\w+\s*,\s*\w+\s*\|\|\s*0\s*\]'
        r'\s*\[\s*%s\("([^"]+)",\s*(\d+)\)\s*\]\s*\(\s*"\\n"\s*\)' % (re.escape(name_c), re.escape(name_c)), js)
    if not m or dec_c(m.group(3), int(m.group(4))) != 'join':
        raise _RulesError('static_param anchor not found')
    static_param = dec_c(m.group(1), int(m.group(2)))

    # sign header key + prefix property
    m = re.search(
        r'return\s+\w+\[\s*%s\("([^"]+)",\s*(\d+)\)\s*\]\s*=\s*\[\s*\w+\[\s*%s\("([^"]+)",\s*(\d+)\)\s*\]'
        r'\s*,\s*\w+\s*,\s*function' % (re.escape(name_c), re.escape(name_c)), js)
    if not m or dec_c(m.group(1), int(m.group(2))) != 'sign':
        raise _RulesError('sign/prefix anchor not found')
    prefix_prop = dec_c(m.group(3), int(m.group(4)))

    # suffix property + final join(":")
    m = re.search(
        r'\w+\[\s*%s\("([^"]+)",\s*(\d+)\)\s*\]\s*\]\s*\[\s*%s\("([^"]+)",\s*(\d+)\)\s*\]\s*\(\s*":"\s*\)'
        % (re.escape(name_c), re.escape(name_c)), js)
    if not m or dec_c(m.group(3), int(m.group(4))) != 'join':
        raise _RulesError('suffix anchor not found')
    suffix_prop = dec_c(m.group(1), int(m.group(2)))

    # Helper-object string constants: name: c("key", num)
    consts = {name: (key, int(num)) for name, key, num in
              re.findall(r'(\w+):%s\("([^"]+)",\s*(\d+)\)' % re.escape(name_c), js)}
    if prefix_prop not in consts or suffix_prop not in consts:
        raise _RulesError('prefix/suffix properties not found')
    prefix = dec_c(consts[prefix_prop][0], consts[prefix_prop][1])
    suffix = dec_c(consts[suffix_prop][0], consts[suffix_prop][1])

    # Arithmetic helper map: name: function(a,b){return a<op>b}
    ops = dict(re.findall(r'(\w+):function\(\w+,\w+\)\{return \w+\s*([+\-*%])\s*\w+\}', js))

    # Checksum: symbolically evaluate the Math.abs(...) argument of the inlined IIFE
    m = re.search(r'return\s+Math\[\s*%s\((\d+),"([^"]+)"\)\s*\]\s*\(' % re.escape(name_o), js)
    if not m or dec_o(int(m.group(1)), m.group(2)) != 'abs':
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
    mt = re.match(r'\[\s*%s\((\d+),"([^"]+)"\)\s*\]\s*\(\s*16\s*\)' % re.escape(name_o), tail)
    if not mt or dec_o(int(mt.group(1)), mt.group(2)) != 'toString':
        raise _RulesError('toString check failed')

    checksum_indexes, checksum_constant = _of_eval_checksum(js[expr_start:i - 1], ops, dec_o)
    return {
        'static_param': static_param,
        'prefix': prefix,
        'suffix': suffix,
        'checksum_indexes': checksum_indexes,
        'checksum_constant': checksum_constant,
    }


class OnlyFansIE(InfoExtractor):
    _VALID_URL = r'https?://(?:www\.)?onlyfans\.com/(?P<id>\d+)/(?P<username>[\w.-]+)'
    _TESTS = [{
        # Requires an active session (--cookies); DRM-only creators raise
        # "This video is DRM protected" after metadata extraction.
        'url': 'https://onlyfans.com/2669829379/kenzeygrey',
        'only_matching': True,
    }]

    _CDN_BASE = 'https://cdn2.onlyfans.com'
    _SITE_CONFIG_CACHE = {}

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
        app_js = self._download_webpage(app_js_url, video_id, note='Downloading app bundle')
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
                js_url, video_id, note='Downloading sign chunk', fatal=False)
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

    def _call_api(self, path, video_id, config, user_id, referer):
        time_ms = int(time.time() * 1000)
        x_bc = self._download_webpage(
            f'{self._CDN_BASE}/key/', video_id, note='Fetching anti-bot token',
            fatal=False, headers={'Accept': '*/*'})
        x_hash = self._download_webpage(
            f'{self._CDN_BASE}/hash/?u={user_id}', video_id, note='Fetching hash token',
            fatal=False, headers={'Accept': '*/*'})
        headers = {
            'Accept': 'application/json, text/plain, */*',
            'app-token': config['app_token'],
            'user-id': user_id,
            'time': str(time_ms),
            'sign': self._sign(config['rules'], path, user_id, time_ms),
            'x-of-rev': config['x_of_rev'],
            'Referer': referer,
        }
        if x_bc:
            headers['x-bc'] = x_bc.strip()
        if x_hash:
            headers['x-hash'] = x_hash.strip()
        return self._download_json(
            f'https://onlyfans.com{path}', video_id, headers=headers,
            note='Calling post API', expected_status=[400, 401, 403])

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
            })
        for res, url in (media.get('videoSources') or {}).items():
            if url_or_none(url):
                formats.append({
                    'url': url,
                    'format_id': f'source-{res}',
                    'height': int_or_none(res),
                })

        http_headers = None
        has_drm_manifest = False
        if not formats:
            # DRM-enabled creators serve only CloudFront-signed HLS/DASH manifests
            drm = files.get('drm') or {}
            manifest = drm.get('manifest') or {}
            signature = drm.get('signature') or {}
            hls_url = url_or_none(manifest.get('hls'))
            sig = signature.get('hls') or {}
            cf_keys = ('CloudFront-Policy', 'CloudFront-Signature', 'CloudFront-Key-Pair-Id')
            if hls_url and all(sig.get(k) for k in cf_keys):
                has_drm_manifest = True
                cf_cookie = '; '.join(f'{k}={sig[k]}' for k in cf_keys)
                http_headers = {'Cookie': cf_cookie}
                formats.extend(self._extract_m3u8_formats(
                    hls_url, media_id, 'mp4', m3u8_id='hls', fatal=False,
                    headers=http_headers))

        if not formats or all(f.get('has_drm') for f in formats):
            if has_drm_manifest:
                self.report_drm(media_id)
            self.raise_no_formats('No playable media found for this post', expected=True, video_id=media_id)

        info = {
            'id': media_id,
            'title': clean_html(post.get('text')) or f'OnlyFans post {post.get("id")}',
            'duration': int_or_none(media.get('duration')),
            'thumbnail': url_or_none((files.get('preview') or {}).get('url')),
            'uploader': username,
            'timestamp': parse_iso8601(post.get('postedAt')),
            'formats': formats,
        }
        if http_headers:
            info['http_headers'] = http_headers
        return info

    def _real_extract(self, url):
        post_id, username = self._match_valid_url(url).group('id', 'username')

        cookies = self._get_cookies('https://onlyfans.com')
        auth_id = cookies.get('auth_id')
        if not auth_id or not cookies.get('sess'):
            self.raise_login_required(
                'OnlyFans requires an active session; pass cookies with --cookies',
                method='cookies')
        user_id = auth_id.value

        webpage = self._download_webpage(url, post_id, note='Downloading post page')
        config = self._get_site_config(webpage, post_id)

        # The signed path is the API path plus query, exactly as requested
        post = self._call_api(f'/api2/v2/posts/{post_id}?skip_users=all', post_id, config, user_id, url)
        if not isinstance(post, dict) or 'error' in post:
            message = (post or {}).get('error', {}).get('message') if isinstance(post, dict) else None
            raise ExtractorError(
                f'OnlyFans API error: {message or "unknown"} (session cookies may be expired)',
                expected=True)

        entries = [
            self._extract_video(media, post, username)
            for media in post.get('media') or []
            if isinstance(media, dict) and media.get('type') == 'video' and media.get('canView', True)
        ]
        if not entries:
            self.raise_no_formats(
                'No viewable video media found (the post may be paywalled)',
                expected=True, video_id=post_id)
        if len(entries) == 1:
            return entries[0]
        return self.playlist_result(
            entries, post_id, clean_html(post.get('text')), uploader=username)
