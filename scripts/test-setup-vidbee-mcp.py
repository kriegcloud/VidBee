"""Exercise vault enrollment and harness merges with disposable homes and fake op commands."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import tomllib
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCRIPT = Path(__file__).with_name('setup-vidbee-mcp.sh').resolve()


class SetupTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='vidbee-mcp-test-')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.bin = self.home / 'bin'
        self.bin.mkdir()
        self.env = {**os.environ, 'HOME': str(self.home),
                    'XDG_CONFIG_HOME': str(self.home / '.config'),
                    'XDG_DATA_HOME': str(self.home / '.local/share'),
                    'PATH': str(self.bin) + os.pathsep + os.environ['PATH'],
                    'OP_ALLOW_DESKTOP': '1', 'OP_AGENT_BACKEND': 'connect'}
        for key in ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'KIMI_CODE_HOME',
                    'VIDBEE_MCP_CONFIG', 'VIDBEE_CLAUDE_DESKTOP_CONFIG']:
            self.env.pop(key, None)
        self.command('op-human', '''import json,sys,os
from pathlib import Path
home=Path(os.environ['HOME'])
item=json.load(sys.stdin)
(home/'fake-token').write_text(item['fields'][0]['value'])
with (home/'creations').open('a') as f: f.write('created\\n')
print(json.dumps({'id':'a'*26}))
''')
        self.command('op', '''import os,sys
from pathlib import Path
home=Path(os.environ['HOME'])
assert os.environ['OP_AGENT_BACKEND']=='sa'
assert 'OP_ALLOW_DESKTOP' not in os.environ
assert sys.argv[1:] == ['read','op://BEEP_SECRETS/'+'a'*26+'/credential','--no-newline']
if (home/'fail-op').exists(): sys.exit(1)
print((home/'fake-token').read_text(),end='')
''')
        self.command('op-doctor', '''import os
from pathlib import Path
with (Path(os.environ['HOME'])/'doctors').open('a') as f: f.write('doctor\\n')
print('type=service-account mode=sa count=1')
''')
        self.write('.codex/config.toml', 'model = "gpt-6.1-sol"\nmodel_reasoning_effort = "medium"\n# keep this comment\n[mcp_servers.other]\ncommand = "keep-me"\n')
        self.write('.grok/config.toml', 'disabled_mcp_servers = ["other"]\n[mcp_servers.other]\ncommand = "untouched"\n')
        self.write('.claude.json', json.dumps({'mcpServers': {'other': {'command': 'keep'}}, 'numStartups': 5}))

    def command(self, name, source):
        path = self.bin / name
        path.write_text('#!/usr/bin/env python3\n' + source)
        path.chmod(0o700)

    def write(self, relative, text):
        path = self.home / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def run_setup(self, *args, success=True):
        result = subprocess.run([str(SCRIPT), *args], env=self.env, capture_output=True,
                                text=True, timeout=30)
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        if (self.home / 'fake-token').exists():
            token = (self.home / 'fake-token').read_text()
            self.assertNotIn(token, result.stdout + result.stderr)
        return result

    def test_preview_and_running_process_never_enroll(self):
        before = (self.home / '.codex/config.toml').read_bytes()
        self.run_setup('--dry-run')
        self.assertFalse((self.home / 'creations').exists())
        self.write('.config/VidBee/mcp.json', json.dumps({'pid': os.getpid()}))
        self.run_setup('--install', success=False)
        self.assertEqual((self.home / '.codex/config.toml').read_bytes(), before)
        self.assertFalse((self.home / 'creations').exists())

    def test_install_preserves_other_settings_and_rerun_reuses_item(self):
        self.run_setup('--install')
        codex = tomllib.loads((self.home / '.codex/config.toml').read_text())
        self.assertEqual(codex['model'], 'gpt-6.1-sol')
        self.assertEqual(codex['model_reasoning_effort'], 'medium')
        self.assertEqual(codex['mcp_servers']['other']['command'], 'keep-me')
        self.assertIn('# keep this comment', (self.home / '.codex/config.toml').read_text())
        claude = json.loads((self.home / '.claude.json').read_text())
        self.assertEqual(claude['numStartups'], 5)
        self.assertEqual(claude['mcpServers']['other']['command'], 'keep')
        for path in ['.config/Claude/claude_desktop_config.json', '.claude.json',
                     '.kimi-code/mcp.json', '.junie/mcp/mcp.json', '.cursor/mcp.json',
                     '.config/muse/settings.json']:
            server = json.loads((self.home / path).read_text())['mcpServers']['vidbee']
            self.assertEqual(server['args'], ['--bridge'])
            self.assertNotIn('env', server)
        self.assertEqual(tomllib.loads((self.home / '.grok/config.toml').read_text())['disabled_mcp_servers'], ['other'])
        first = (self.home / '.codex/config.toml').read_bytes()
        self.run_setup('--install')
        self.assertEqual((self.home / '.codex/config.toml').read_bytes(), first)
        self.assertEqual((self.home / 'creations').read_text().splitlines(), ['created'])
        self.assertEqual((self.home / '.config/VidBee/mcp.json').stat().st_mode & 0o777, 0o600)

    def test_service_failure_keeps_configs_and_resumes_without_duplicate_item(self):
        self.write('fail-op', '')
        before = (self.home / '.codex/config.toml').read_bytes()
        self.run_setup('--install', success=False)
        self.assertEqual((self.home / '.codex/config.toml').read_bytes(), before)
        self.assertFalse((self.home / '.config/VidBee/mcp.json').exists())
        self.assertEqual((self.home / 'doctors').read_text().splitlines(), ['doctor'])
        (self.home / 'fail-op').unlink()
        self.run_setup('--install')
        self.assertEqual((self.home / 'creations').read_text().splitlines(), ['created'])

    def test_invalid_harness_fails_before_vault_creation(self):
        self.write('.cursor/mcp.json', '{bad json')
        self.run_setup('--install', success=False)
        self.assertFalse((self.home / 'creations').exists())

    def test_bridge_protocol_and_service_account_check(self):
        self.run_setup('--install')
        token = (self.home / 'fake-token').read_text()
        received = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                if self.headers.get('Authorization') != 'Bearer ' + token:
                    self.send_error(401)
                    return
                message = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                received.append(message['method'])
                if 'id' not in message:
                    self.send_response(202)
                    self.end_headers()
                    return
                result = {'tools': []} if message['method'] == 'tools/list' else {
                    'protocolVersion': '2025-03-26', 'capabilities': {},
                    'serverInfo': {'name': 'fixture', 'version': '1'}}
                body = json.dumps({'jsonrpc': '2.0', 'id': message['id'], 'result': result}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        server = None
        for port in range(27100, 27121):
            try:
                server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
                break
            except OSError:
                continue
        self.assertIsNotNone(server, 'No test port available in VidBee range')
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        config = self.home / '.config/VidBee/mcp.json'
        document = json.loads(config.read_text())
        document['url'] = f'http://127.0.0.1:{server.server_port}/mcp'
        config.write_text(json.dumps(document))
        self.run_setup('--check')
        messages = [
            {'jsonrpc': '2.0', 'id': 9, 'method': 'initialize', 'params': {}},
            {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
            {'jsonrpc': '2.0', 'id': 10, 'method': 'tools/list', 'params': {}}
        ]
        installed = self.home / '.local/libexec/vidbee-mcp/setup.sh'
        result = subprocess.run([str(installed), '--bridge'], env=self.env,
                                input='\n'.join(map(json.dumps, messages)) + '\n',
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        responses = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual({r['id'] for r in responses}, {9, 10})
        self.assertNotIn(token, result.stdout + result.stderr)
        self.assertIn('notifications/initialized', received)
        document['url'] = 'https://example.com/mcp'
        config.write_text(json.dumps(document))
        self.run_setup('--check', success=False)


if __name__ == '__main__':
    unittest.main()
