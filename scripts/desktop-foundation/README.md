# Desktop foundation pre-port characterization

These fixtures were recorded from `1437d1fc90cc282ce427f173d74c73a3d72ac934`,
before changing desktop source. Application source is executed directly;
`source-harness.mjs` transpiles it with esbuild and substitutes explicit host
boundaries. It never evaluates an Electron executable or accesses a real profile.
The installed electron-store and Conf implement settings persistence; the test
subclass records writes and injects failures. VM instances have separate module
caches. Pure parsers and Jotai are the installed implementations.

Run from the repository root with Node 22.23.4 first on PATH:

```sh
bun run test:foundation
```

The root `test` script includes this command. Its Node suites use `node:test`
through tsx. Unit observations use `@effect/vitest` hosted by Bun. Temporary
settings profiles are removed after each source observation. Use a disk-backed
`TMPDIR` under the lane scratch directory.

The packaged companion uses the existing offline namespace launcher, bounded
process capture and renderer CDP helper. It launches this worktree's own build,
with fresh profiles, HOME/XDG directories, descriptors and MCP configuration.
Every launch verifies `resources/app.asar` against a caller-supplied SHA-256.
It never discovers or attaches to the owner's running app. Cleanup signals only
the launcher created by this invocation; that launcher owns its process group.

```sh
bun run test:foundation:packaged --build apps/desktop/dist/linux-unpacked \
  --scratch "$LANE" --sha256 "$(sha256sum apps/desktop/dist/linux-unpacked/resources/app.asar | cut -d' ' -f1)"
```

Supply the previously recorded hash when reproducing a recording. Calculating a
new hash merely identifies a new build; it does not establish that it is the
pre-port source. The original recorded archive SHA-256 is
`f9d34a07af53e9fbd2574be46a935138f56ffa7faeb70288da1636f154467f7e`.
Build command: `bun run build:linux`, with a directory containing a symlink to
`/usr/bin/uv` first on PATH, under pinned Node. The installed app is never used.

`packaged.expected.json` (UTC) and `packaged.tokyo.expected.json` (Asia/Tokyo)
are separate from existing public goldens. Use `TZ=UTC` or `TZ=Asia/Tokyo`; the
recorder selects the corresponding fixture. Fresh-install language really differs
between those timezones and remains literal in each fixture. `--record`
explicitly replaces only this new fixture and must run on the verified pre-port
build. `settings.expected.json` is the source-level observation; its recorder is
`node --import tsx scripts/desktop-foundation/observe.mjs --record`.
Review recorded changes; a new recording is never a response to a parity failure.

Normalization replaces only the exact scratch profile root in Conf's error
messages, and the exact per-launch HOME in packaged answers. Restart observations separately
replace the exact preceding profile HOME with `<previous-home>`, preserving its
difference from the new launch HOME. It retains wrong
values, unknown fields, errors, array order, write order and event counts.
Paths under `/synthetic` and `/portable` are deliberate fake host inputs.

The report at `docs/effect-port/reports/9.0.md` is the coverage and acceptance
record, including limitations. These tests characterize the old surface. They do
not test the proposed RPC, typed projection, codecs or transport capacity limits.

The packaged scenarios are fresh, owned single-instance rejection, background,
returning/stale marker, restart of that stopped profile, current marker and
malformed fields. The background wrapper passes only `--background` to the
original executable and symlinks its unchanged resources. The single-instance
case disables the launcher's multiple-instance allowance only for its own
throwaway profile, then launches and observes a second owned process inside the
same offline namespace. Both executable launches verify the archive hash.
Timezone setup is sourced inside that namespace; setting TZ only on the outer
runner would be discarded by the launcher's clean environment.

The source fixture retains the original BigInt and cyclic-JSON engine errors as
receipts. The assertion for those two explicit vectors requires failure, following
PORT-GUIDE's rule for inputs outside the declared types; it does not require an
engine error's wording or class. All successful results, declared error contracts,
keys and ordering remain exact. No public golden normalizer uses this policy.
