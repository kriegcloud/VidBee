# Contributing

Use Bun (the version in `.bun-version`) for this workspace. Run `bun install`;
prepare patches tsrs with Effect diagnostics and installs Lefthook. Desktop,
CLI and browser extension are the applications; shared code belongs in packages.

Read [the Effect port guide](docs/effect-port/PORT-GUIDE.md) before changing a
ported package. Build schemas first, then service contracts, implementations
and tests. New third-party dependencies belong in the root catalog, with
`catalog:` in manifests. Use Conventional Commits for commits and PR titles.

Before submitting, run `bun run check`, `bun run test`, `bun run deps:check` and
`bun run port:check`. Ported package checks use the patched tsrs compiler and
Biome; tests use `@effect/vitest` via `bunx --bun vitest run`. Legacy audit tests
remain available as `bun run test:audit`.

Format only the files you change. Ported packages use `biome check --write .`
from their package directory. Legacy desktop formatting uses `bun run fix`.
Do not reformat unported code during a port. Lefthook validates commits without
rewriting the working tree or index. Keep all diagnostics and avoid suppression
comments. Do not modify the owner's live application profile or running process.

Business strings use i18n; add English keys to `en.json` first. If locale
validation reports missing keys, provide real translations in each affected
language. Comments and console text use English. Favor simple, accessible,
type-safe code and behavior-preserving changes.
