#!/usr/bin/env bash
# One-time vault enrollment and MCP configuration; runtime uses the agent service account.
set +x
set -euo pipefail
exec python3 /dev/fd/3 "$0" "$@" 3<<'PY'
import argparse
import concurrent.futures
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import tomllib
import urllib.error
import urllib.parse
import urllib.request

SCRIPT = Path(sys.argv[1]).resolve()
HOME = Path.home()
CONFIG = Path(os.environ.get('XDG_CONFIG_HOME', HOME / '.config'))
DATA = Path(os.environ.get('XDG_DATA_HOME', HOME / '.local/share')) / 'vidbee-mcp'
INSTALLED = HOME / '.local/libexec/vidbee-mcp/setup.sh'
CONNECTION = DATA / 'connection.json'
STATE = DATA / 'enrollment.json'
MCP = Path(os.environ.get('VIDBEE_MCP_CONFIG', CONFIG / 'VidBee/mcp.json')).resolve()
DOCTORED = False


def atomic(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def encode(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def doctor():
    global DOCTORED
    if not DOCTORED:
        DOCTORED = True
        command = shutil.which('op-doctor')
        if not command and (HOME / '.local/bin/op-doctor').is_file():
            command = str(HOME / '.local/bin/op-doctor')
        if command:
            subprocess.run([command], stdin=subprocess.DEVNULL, stdout=sys.stderr,
                           stderr=sys.stderr, check=False, timeout=30)


def service_token(op, reference):
    env = {**os.environ, 'OP_AGENT_BACKEND': 'sa'}
    env.pop('OP_ALLOW_DESKTOP', None)
    try:
        result = subprocess.run([op, 'read', reference, '--no-newline'], env=env,
                                stdin=subprocess.DEVNULL, capture_output=True, timeout=30)
        if result.returncode:
            raise ValueError()
        token = result.stdout.decode().strip()
        if not re.fullmatch(r'[a-f0-9]{64}', token):
            raise ValueError()
        return token
    except (ValueError, OSError, subprocess.TimeoutExpired):
        doctor()
        raise RuntimeError('Failed: OP_AGENT_BACKEND=sa op read <saved VidBee reference>. '
                           'Check service-account access to BEEP_SECRETS; no Desktop fallback.') from None


def endpoint(config):
    document = json.loads(config.read_text())
    if not document.get('enabled'):
        raise RuntimeError('VidBee MCP is disabled. Enable it in VidBee Settings.')
    url = document.get('url')
    parsed = urllib.parse.urlsplit(url or '')
    if (parsed.scheme != 'http' or parsed.hostname != '127.0.0.1'
            or parsed.port not in range(27100, 27121) or parsed.path != '/mcp'
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise RuntimeError('Start VidBee: no valid loopback MCP endpoint is published.')
    return url


# Explicitly bypass proxy environment variables and reject credential-bearing redirects.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def rpc(config, token, message):
    url = endpoint(config)
    request = urllib.request.Request(url, data=json.dumps(message).encode(), headers={
        'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream',
        'Authorization': 'Bearer ' + token,
        'MCP-Protocol-Version': '2025-03-26'
    })
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=300) as response:
            if response.status == 202:
                return None
            # VidBee's stateless transport explicitly enables JSON responses.
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError('VidBee MCP HTTP ' + str(error.code)) from None
    except urllib.error.URLError:
        raise RuntimeError('VidBee MCP connection failed; start VidBee and retry.') from None


def bridge(check=False):
    settings = json.loads(CONNECTION.read_text())
    token = service_token(settings['op'], settings['reference'])
    config = Path(settings['mcpConfig'])
    endpoint(config)
    if check:
        init = rpc(config, token, {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
            'protocolVersion': '2025-03-26', 'capabilities': {},
            'clientInfo': {'name': 'vidbee-vault-check', 'version': '1.0.0'}
        }})
        if not init or 'error' in init:
            raise RuntimeError('VidBee MCP initialization failed')
        tools = rpc(config, token, {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list', 'params': {}})
        if not tools or 'error' in tools:
            raise RuntimeError('VidBee MCP tools/list failed')
        print('Service-account authentication OK; VidBee exposes '
              + str(len(tools['result']['tools'])) + ' tools.')
        return
    lock = threading.Lock()

    def forward(message):
        try:
            response = rpc(config, token, message)
        except Exception:
            response = {'jsonrpc': '2.0', 'id': message.get('id'), 'error': {
                'code': -32000, 'message': 'VidBee MCP unavailable or credential rejected; run setup.sh --check.'
            }}
        if response is not None and 'id' in message:
            with lock:
                print(json.dumps(response), flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        pending = set()
        for line in sys.stdin:
            if len(line) > 1024 * 1024:
                raise RuntimeError('MCP request exceeds 1 MiB')
            message = json.loads(line)
            if not isinstance(message, dict) or message.get('jsonrpc') != '2.0':
                raise RuntimeError('Invalid MCP request')
            # Bound work even if a client writes faster than VidBee can respond.
            pending = {future for future in pending if not future.done()}
            if len(pending) >= 16:
                concurrent.futures.wait(pending, return_when=concurrent.futures.FIRST_COMPLETED)
            pending.add(pool.submit(forward, message))


def json_patch(path, entry, key='mcpServers'):
    original = path.read_bytes() if path.exists() else None
    document = json.loads(original) if original is not None else {}
    servers = document.setdefault(key, {})
    if not isinstance(servers, dict):
        raise RuntimeError('Invalid MCP server map: ' + str(path))
    servers['vidbee'] = entry
    return original, encode(document)


def toml_patch(path, entry):
    original = path.read_bytes() if path.exists() else None
    text = original.decode() if original is not None else ''
    parsed = tomllib.loads(text)
    # Replace only VidBee tables. Keep unrelated text, comments, model and permission pins.
    headers = list(re.finditer(r'^\[[^\n]+\][ \t]*(?:#.*)?$', text, re.M))
    spans = []
    for index, header in enumerate(headers):
        name = header.group().split(']', 1)[0][1:]
        if re.fullmatch(r'''mcp_servers\.(?:vidbee|"vidbee"|'vidbee')(?:\..+)?''', name):
            spans.append((header.start(), headers[index + 1].start() if index + 1 < len(headers) else len(text)))
    if 'vidbee' in parsed.get('mcp_servers', {}) and not spans:
        raise RuntimeError('Unsupported inline VidBee TOML entry; migrate it to a table: ' + str(path))
    for start, end in reversed(spans):
        text = text[:start] + text[end:]
    text = text.rstrip() + '\n\n[mcp_servers.vidbee]\n'
    for key, value in entry.items():
        text += key + ' = ' + json.dumps(value) + '\n'
    next_document = tomllib.loads(text)
    expected = {**parsed.get('mcp_servers', {}), 'vidbee': entry}
    if next_document.get('mcp_servers') != expected:
        raise RuntimeError('TOML MCP merge validation failed: ' + str(path))
    for key in parsed.keys() - {'mcp_servers'}:
        if next_document.get(key) != parsed[key]:
            raise RuntimeError('Unrelated TOML settings changed: ' + str(path))
    return original, text.encode()


def plans():
    entry = {'command': str(INSTALLED), 'args': ['--bridge']}
    targets = [
        ('Claude Desktop', Path(os.environ.get('VIDBEE_CLAUDE_DESKTOP_CONFIG', CONFIG / 'Claude/claude_desktop_config.json')), 'mcpServers', entry),
        ('Claude Code', Path(os.environ.get('CLAUDE_CONFIG_DIR', HOME / '.claude')).with_suffix('.json'), 'mcpServers', {**entry, 'type': 'stdio'}),
        ('ChatGPT Desktop / Codex', Path(os.environ.get('CODEX_HOME', HOME / '.codex')) / 'config.toml', None, entry),
        ('Kimi', Path(os.environ.get('KIMI_CODE_HOME', HOME / '.kimi-code')) / 'mcp.json', 'mcpServers', entry),
        ('Grok', HOME / '.grok/config.toml', None, {**entry, 'enabled': True}),
        ('Junie', HOME / '.junie/mcp/mcp.json', 'mcpServers', entry),
        ('Cursor Agent', HOME / '.cursor/mcp.json', 'mcpServers', entry),
        # Installed Muse 1.4.14 uses mcpServers (its CLI help and binary schema agree).
        ('Muse', CONFIG / 'muse/settings.json', 'mcpServers', {
            **entry, 'transport': 'stdio', 'framing': 'line_delimited_json',
            'enabled': True, 'mode': 'optional'
        })
    ]
    result = []
    for label, path, key, config in targets:
        path = path.resolve()
        before, after = json_patch(path, config, key) if key else toml_patch(path, config)
        result.append((label, path, before, after))
    return result


def ensure_stopped(document):
    pid = document.get('pid')
    if isinstance(pid, int) and pid > 0:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            pass
        else:
            raise RuntimeError('Quit VidBee before --install: its MCP token is cached in the running app. '
                               'No app or active job will be stopped by this script.')


def setup(install):
    if not shutil.which('op') or not shutil.which('op-human'):
        raise RuntimeError('Both op (agent shim) and op-human must be available on PATH.')
    proposed = plans()  # Validate all harness files before vault enrollment or configuration writes.
    document = json.loads(MCP.read_text()) if MCP.exists() else {}
    if not install:
        print('Preview only. One-time install creates an API Credential in BEEP_SECRETS.')
        print('Session starts use OP_AGENT_BACKEND=sa op read; no Desktop authentication fallback.')
        print('VidBee credential file: ' + str(MCP))
        for label, path, _, _ in proposed:
            print(label + ': ' + str(path))
        print('Quit VidBee, then run this script with --install. Start VidBee afterward and run --check.')
        return
    ensure_stopped(document)
    DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (DATA / 'setup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if STATE.exists():
            enrollment = json.loads(STATE.read_text())
            reference = enrollment['reference']
            token = service_token(shutil.which('op'), reference)
        else:
            token = secrets.token_hex(32)
            item = {
                'title': 'VidBee MCP', 'category': 'API_CREDENTIAL',
                'fields': [{'id': 'credential', 'type': 'CONCEALED',
                            'label': 'credential', 'value': token}],
                'tags': ['vidbee', 'mcp', 'workstation']
            }
            try:
                created = subprocess.run(['op-human', 'item', 'create', '-', '--vault', 'BEEP_SECRETS',
                                          '--format', 'json'], input=json.dumps(item).encode(),
                                         capture_output=True, timeout=180)
                if created.returncode:
                    raise ValueError()
                item_id = json.loads(created.stdout)['id']
                if not re.fullmatch(r'[a-z0-9]{26}', item_id):
                    raise ValueError()
            except (ValueError, KeyError, OSError, subprocess.TimeoutExpired):
                doctor()
                raise RuntimeError('Failed: op-human item create - --vault BEEP_SECRETS. '
                                   'No harness configurations were changed.') from None
            reference = 'op://BEEP_SECRETS/' + item_id + '/credential'
            # Retain the nonsecret reference even if service-account verification fails.
            atomic(STATE, encode({'reference': reference, 'status': 'pending'}))
            if not secrets.compare_digest(service_token(shutil.which('op'), reference), token):
                raise RuntimeError('Service-account verification returned a different token.')
        ensure_stopped(json.loads(MCP.read_text()) if MCP.exists() else {})
        stamp = time.strftime('%Y%m%d-%H%M%S') + '-' + secrets.token_hex(3)
        backup = DATA / 'backups' / stamp
        backup.mkdir(parents=True, mode=0o700)
        writes = [(label, path, before, after) for label, path, before, after in proposed]
        credential = {**document, 'version': 1, 'enabled': True, 'token': token, 'url': None, 'pid': None}
        writes += [('VidBee credential', MCP, MCP.read_bytes() if MCP.exists() else None, encode(credential)),
                   ('Bridge launcher', INSTALLED, INSTALLED.read_bytes() if INSTALLED.exists() else None, SCRIPT.read_bytes()),
                   ('Bridge settings', CONNECTION, CONNECTION.read_bytes() if CONNECTION.exists() else None,
                    encode({'reference': reference, 'op': shutil.which('op'), 'mcpConfig': str(MCP)}))]
        changed = []
        manifest = []
        try:
            for index, (label, path, before, after) in enumerate(writes):
                current = path.read_bytes() if path.exists() else None
                if current != before:
                    raise RuntimeError('Configuration changed during setup: ' + str(path))
                saved = backup / str(index)
                if before is not None:
                    atomic(saved, before)
                manifest.append({'label': label, 'path': str(path), 'backup': str(saved) if before is not None else None})
                atomic(path, after, 0o700 if path == INSTALLED else 0o600)
                changed.append((path, before, after))
            atomic(STATE, encode({'reference': reference, 'status': 'configured', 'backup': str(backup)}))
        except Exception:
            for path, before, after in reversed(changed):
                if path.read_bytes() == after:
                    if before is None:
                        path.unlink()
                    else:
                        atomic(path, before, 0o700 if path == INSTALLED else 0o600)
            raise
        finally:
            atomic(backup / 'manifest.json', encode(manifest))
        print('Configured all 8 harness entries. Secret reference: ' + reference)
        print('Backups: ' + str(backup))
        print('Start VidBee, then run: ' + str(INSTALLED) + ' --check')
        print('Restart/reconnect harness sessions to load their new MCP entry. Existing permissions are preserved.')


def main():
    parser = argparse.ArgumentParser(description='Enroll VidBee MCP once; resolve its credential with the service account at session startup.')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--install', action='store_true')
    group.add_argument('--dry-run', action='store_true')
    group.add_argument('--bridge', action='store_true')
    group.add_argument('--check', action='store_true')
    args = parser.parse_args(sys.argv[2:])
    if args.bridge or args.check:
        bridge(args.check)
    else:
        setup(args.install)


try:
    main()
except KeyboardInterrupt:
    sys.exit(130)
except Exception as error:
    # Never print subprocess output, parsed item JSON, configuration data, or tracebacks.
    safe = str(error) if isinstance(error, RuntimeError) else 'Setup/bridge failed (' + type(error).__name__ + '). Check configuration syntax and file permissions.'
    print('vidbee-mcp: ' + safe, file=sys.stderr)
    sys.exit(1)
PY
