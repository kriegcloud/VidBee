# Immutable CLI reference

This is test data outside every application/package scan root. It must remain after
the temporary CLI host is removed. Never copy it into a package or publication.

`index.mjs` is the reviewed pre-port executable from revision
`9dab889b0b1d5328721802d65699a5f8593bf2e2`. `bin/vidbee.mjs`, `package.json` and
`LICENSE` retain that revision's bytes. `library.mjs` bundles its old source exports
plus the scanner registries for direct differential tests. `pure-results.json`
records the bounded generated inputs from `apps/cli/test/pure-vectors.mjs`; an
`engine: true` record retains old diagnostic text for evidence but requires only
failure from the replacement. Manifest hashes are checked by the Node suite.

The initial capture verified unchanged source/workspace inputs with git diff and
matched the independently reviewed executable hash. It did not use the tracked
old dist as a provenance substitute. The restricted lane could not execute the
full detached-checkout installation procedure; see the phase report.

Explicit regeneration, before changing any implementation, uses a clean detached
checkout of the recorded revision under the standard workstation-apps worktree
location. With Node 22.23.4 and Bun 1.4.4 selected, run:

```sh
node apps/cli/scripts/record-pre-port.mjs <clean-detached-pre-port-checkout>
```

That script installs the frozen lockfile and runs the old build. It captures a
repository-root in-memory build with the reviewed build options to keep esbuild's
relative source labels reproducible, and refuses an executable hash mismatch.
Normal tests never invoke it. A source or catalog change must not regenerate this
reference to make parity tests pass.

Run the pure tests and offline Node observations with:

```sh
bun run --cwd apps/cli test
bun run --cwd apps/cli test:node
```

The root `bun run test` includes both. Linux user/network namespaces and `ip` are
required. Failure to create the namespace fails the tests; there is no online mode.
The Node wrapper asserts the repository's pinned Node version. When invoking tests
from a Bun-hosted environment, explicitly select the pinned Node before launching
`tsx`; Bun's `node` alias is not a substitute.

The worker keeps reference/candidate execution at identical scratch paths, with a
fresh profile and controlled PATH. It compares raw output bytes before parsing
JSON for additional assertions. The fixture server is inside isolated loopback;
a preload guard also rejects unexpected fetch destinations and executable names.
A controlled registry replacement handles the fixed production registry URL.
Trace assertions cover app-facing sync/callback/promise filesystem calls under the run root,
not module-loader I/O or a complete syscall audit. Low-level open/read/stat and native addon I/O are outside that instrumentation;
the native candidate must qualify its actual file access against it.

Failures retain their scratch tree and print its location. Byte mismatches include
the first differing offset and raw output files. Normal successful runs clean up
only their own trees/processes. Production signals are observed before harness
cleanup sends SIGKILL to an owned fixture child. The tests do not signal any PID
obtained from an ambient descriptor.

`apps/cli/test/approved-changes.json` names the reviewed exceptions. Large slow-pipe
and closed-pipe assertions currently record legacy behavior. The implementation
lane must make the candidate assert completed output/nonzero closed-pipe failure
while retaining the old reference observation. All other deterministic bytes keep
strict equality.
