# Regenerating old-source oracles

Use the repository-pinned Node with `--import tsx` for generators that import TypeScript observers.
Use an empty directory on disk as `<scratch>`. The scripts compare exact bytes and never replace
existing expectations. `prepare-old-oracle.mjs <scratch> [revision]` extracts unchanged source
from Git (`9dab889b0b1d5328721802d65699a5f8593bf2e2` by default), bundles relative imports with esbuild, marks output ESM, and keeps
third-party/workspace dependencies external through the current checkout's node_modules.

Run these from the checkout root after preparation:

- `node --import tsx packages/transcription-legacy/test/fixtures/generate-pure-oracle.mjs <scratch>`
- `node --import tsx packages/transcription-legacy/test/fixtures/generate-review-orchestration.mjs <scratch>`
- `node --import tsx packages/transcription-legacy/test/fixtures/generate-stateful-oracles.mjs <scratch>`
- `node --import tsx packages/transcription-legacy/test/fixtures/generate-worker-admission.mjs <scratch>`
- `node --import tsx packages/transcription-legacy/test/fixtures/generate-provider-matrix.mts <scratch>`

The first four retain the original committed oracle bytes. Stateful generation clears the
previous executor observer's task partial before moving to the reentry observer, matching the
original separate-process recordings. Provider fixtures were recorded only from unchanged old
source using the generator's explicit `--record-old` flag. No golden update flag is involved.
Ordinary tests compare the port with these committed results; regeneration is a separate audit.
Characterization process fixtures retain their original in-test recording mechanism and are
never regenerated against the compatibility implementation during integration.

The original `oldInputsSha256` bundle hashes in orchestration provenance describe the original
recording artifacts. Fresh esbuild source comments can contain a different scratch prefix, so
new bundle bytes need not equal those historical bundle hashes. The pinned Git source revision,
source hashes and exact regenerated fixture bytes establish the reproducible oracle contract.
`oracle-provenance.json` records every expected fixture's SHA-256 and its in-repo generators.
