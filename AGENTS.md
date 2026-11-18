# VidBee agent instructions

1. Use Bun, never npm or pnpm. Run `bun run check` after code changes.
2. Read `docs/effect-port/PORT-GUIDE.md` before porting or changing ported code.
3. Desktop, CLI and browser extension are the only apps. Share UI and schemas
   through `packages/` where appropriate.
4. Model schemas before Context.Service contracts and implementations. Use the
   installed Effect v4 public declarations to validate every API.
5. Never add suppressions, lower diagnostics, populate tsgo overrides or use
   `any` casts to bypass a rule. Effect generators use Effect.fn/fnUntraced;
   collections use Effect HashMap/HashSet. Promise adapters belong in drivers,
   runtime execution in entrypoints and legacy facades.
6. Every third-party version belongs in the root catalog; manifests use
   `catalog:`. Keep `bun run deps:check` passing.
7. Ported packages use reference Biome rules and patched tsrs. Unported code
   retains legacy formatting and findings. Format only edited, ported files;
   preserve JavaScript build scripts. Lefthook checks without rewriting files.
8. Tests use `@effect/vitest` and `bunx --bun vitest run`, never `bun test`.
   Run `bun run test`, `bun run deps:check` and `bun run port:check` before handoff.
9. Keep behavior and legacy signatures/initialization unchanged during a port.
   Do not launch, stop or signal the owner's running application or touch its
   live profile. Report local proof separately from packaged/golden proof.
10. Support i18n: initially change English `en.json`; when locale checks fail,
    complete actual translations in every affected locale. Use English comments
    and console output. Keep code simple and accessible (KISS/YAGNI).
11. Use Conventional Commits (`type(scope): subject`) for commits and PR titles.
