# VidBee development

Follow the root `AGENTS.md` and `docs/effect-port/PORT-GUIDE.md`.
Use Bun and the root dependency catalog. Build schemas first, then Effect
Context.Service contracts and Layers. Validate Effect v4 APIs against installed
declarations. Preserve all diagnostics and avoid suppressions.

Run `bun run check`, `bun run test`, `bun run deps:check` and `bun run port:check`.
Ported code uses Biome and patched tsrs; unported code retains vendored legacy
Biome presets and formatting. Tests run through @effect/vitest on Bun-backed
Vitest, with the existing node:test audit retained. Lefthook never rewrites the
index. Preserve existing behavior, legacy facades and import side effects.
Do not touch the owner's live profile or running application. Use i18n for
business strings, English comments, simple accessible code and Conventional
Commits. Report packaged/golden proof separately from static and unit checks.
