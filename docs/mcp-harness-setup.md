# Configure VidBee MCP with a service-account credential

Quit VidBee, then run this one-time setup command:

```sh
bash ~/YeeBois/workstation-apps/VidBee/scripts/setup-vidbee-mcp.sh --install
```

Run the same command without `--install` (or with `--dry-run`) to preview the
configuration paths without creating a vault item or editing settings.

The script creates a fresh 64-character hexadecimal MCP token, sends it to
`op-human item create` over stdin, and creates an API Credential named
**VidBee MCP** in **BEEP_SECRETS**. The one-time creation uses your human
1Password route. It verifies the new secret through `OP_AGENT_BACKEND=sa op
read` before configuring any harness. The existing service account must have
read access to that vault. The script does not change service-account grants.

VidBee must be closed because its current MCP implementation caches one bearer
credential for the lifetime of the app. The script does not stop the app,
interrupt jobs, or modify the running process. It writes the new token to
VidBee's owner-only MCP credential file so the next launch accepts it.

The script backs up and merges these user-level harness configurations:

| Harness | Configuration |
| --- | --- |
| Claude Desktop | `~/.config/Claude/claude_desktop_config.json` |
| Claude Code | `~/.claude.json` |
| ChatGPT Desktop / Codex | `~/.codex/config.toml` |
| Kimi Code | `~/.kimi-code/mcp.json` |
| Grok | `~/.grok/config.toml` |
| Junie | `~/.junie/mcp/mcp.json` |
| Cursor Agent | `~/.cursor/mcp.json` |
| Muse | `~/.config/muse/settings.json` |

Kimi and Junie's paths follow their [Kimi MCP documentation](https://moonshotai.github.io/kimi-code/en/customization/mcp.html)
and [Junie MCP documentation](https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html).
The installed Muse 1.4.14-R7309.1 uses `mcpServers`, as confirmed by its CLI
help and binary settings schema. Newer [Muse documentation](https://dev.meta.ai/docs/muse-code/extending)
uses `mcp_servers`; this installer targets the installed version.

Each entry launches `~/.local/libexec/vidbee-mcp/setup.sh --bridge`. The same
single script provides the installer and a line-delimited JSON stdio bridge to
VidBee's stateless JSON HTTP MCP endpoint. There are no downloaded runtime
packages. Python 3.11+ and Bash are required.

At each bridge start, `op` resolves the saved `op://BEEP_SECRETS/<item-id>/credential`
reference using the service-account backend. Desktop fallback is disabled.
The credential is held in memory, never passed as a command argument, printed,
or copied into harness settings. VidBee's own MCP credential file and its
rollback copy necessarily contain the server credential and are owner-only.
The bridge checks the published loopback endpoint on every request, disables
HTTP proxies, and refuses redirects. VidBee must be running when clients connect.

After installing, start VidBee and verify authentication and tool discovery:

```sh
~/.local/libexec/vidbee-mcp/setup.sh --check
```

Restart or reconnect harness sessions to load the new entry. Ordinary harness
MCP enablement/trust controls still apply; the installer preserves permissions,
model defaults, and unrelated server entries. It does not start inference or
verify every harness session automatically.

Enrollment state, the nonsecret vault reference, and config backups live under
`~/.local/share/vidbee-mcp/`. A rerun reuses the created item. If service-account
verification fails, the script runs `op-doctor` once and leaves the harnesses
unchanged; the saved pending enrollment allows a retry without duplicate items.
A configuration-write failure restores files already changed, provided they
have not been edited by another process. Full original config copies and a
manifest are retained in the timestamped backup directory.

Changing the MCP token later through VidBee Settings invalidates the vault
credential too. This setup script does not silently replace or rotate the vault
item to conceal that mismatch.

Tests use disposable homes, stub `op`/`op-human` commands, and a local HTTP
fixture. They do not create real credentials or change your live harness files:

```sh
python scripts/test-setup-vidbee-mcp.py
```
