# Pre-port downloader oracles

These fixtures were recorded against unchanged downloader source at `b5e2b7a`.

- `legacy-types.ts` copies `src/types.ts` declarations verbatim, with a header and relocated
  imports. Those imports point at the frozen declarations here, so future source changes cannot
  silently change the old aliases.
- `legacy-declarations/` preserves the complete declaration-only output of the old package,
  including signatures on classes, function overloads, options, inferred zod shapes and every
  subentry dependency. It was produced with `bunx --bun tsc -p packages/downloader-core/tsconfig.json
  --noEmit false --declaration --emitDeclarationOnly --rootDir packages/downloader-core/src
  --outDir <temporary-directory>`. These are deliberate type fixtures, not build output to replace.
  Part 2 should compare the compatibility API to them under the legacy optional-property setting.
- `process-*.json` records complete executor callback traces from real Node executables. Paths,
  PIDs and the injected clock are normalized; messages and ordering are retained.
- `raw-*.json` records immediate observations through a controlled raw Node child, the installed
  wrapper where applicable, the public executor and its callbacks. These complement real-process
  evidence with exact per-emission boundaries, callback exceptions and re-entry.
- `map-*.json` records argv observed by each public profile manager's fake Node executable.
- Vitest's snapshots alongside the tests pin JSON argv arrays and synchronous callback/state
  sequences. They are old behavior expectations, including surprising outcomes.

`node-runtime.ts` selects the actual repository-pinned Node and checks its version. Every executable
fixture and grandchild uses that selected interpreter; Bun hosts Vitest only. Node-specific suites
are `*.node.ts` and are run through the existing `tsx --test` root audit command. The test runner
itself verifies Node 22.23.4 before the oracle cases. No fixture reads the owner's profile or makes
network requests.

For an intentional baseline recording only, the Node JSON writers recognize
`VIDBEE_RECORD_CHARACTERIZATION=1`. Ordinary tests always compare their output to the checked-in
files. Part 2 must change import/fixture wiring, retaining assertions and fixture contents.
