# Screens lane report

Implemented against `.taste-skill/redesign-spec.md` and the requested screens lane. No commit created.

## Changes

- **Subscriptions — “What's new from what I follow?”** Removed avatar tabs, the All icon tile, the dashed add control, and the RSSHub promo card. Added neutral platform filter chips with tabular meta counts and the full 32px inverted Add subscription action. The empty list now has a borderless 12px-radius `bg-card` panel with 24px padding, the specified copy, Add subscription, and a quiet RSSHub documentation link. The header and empty panel deliberately both expose the same add action, as requested.
- Populated subscriptions render as source rows with 40px avatars/covers, 14px medium names, small source glyphs, new-item count/date, relative last-check time, a neutral pale auto-download pill, and one accessible kebab. YouTube channels and profile sources use circular avatars. Selecting a source still filters its media; selecting it again restores all sources within the selected platform. Refresh, edit, enable/disable, remove, create, polling, feed items, queue actions, and live download/history lookup remain connected to their existing handlers. Removed-source/platform selection resets safely.
- Retained the feed media grid below source rows; flattened its existing image decorations, removed its gradient and blur, made statuses pale, and applied locale-aware publication dates. Data stays real; no sample rows were introduced.
- **Chat — “What do I want done to my media?”** Uses the specified 20px/600 welcome and 14px grey support line, left aligned within the composer column. Suggestion chips remain functional and are neutral, unfilled, and 32px tall. Existing toolbar tooltips and aria-labels were already present and remain. Removed the top gradient overlay and message viewport gradient mask; the composer dock has a flat background. Standalone chat send control stays neutral until the trimmed draft contains text, then uses inverted primary. Local selectors override the shared composer CSS without editing `packages/ui`; the existing grey model picker is retained.
- **About — “Am I up to date?”** App identity/update information comes first: 48px mark, 20px/600 VidBeep, plain grey tabular version, description, one update primary, and an accessible GitHub ghost button. Auto updates and the engine row remain in that panel. Engine versions use live state (no hardcoded example versions), tabular numerals, a pale status pill, and ghost Release notes. Help and feedback is second, with compact feedback/issues, support email, and official website rows and no boxed icons. Developer products and sharing follow as quiet compact rows with ghost actions.
- Preserved distribution ownership: store-managed installations keep their Store action; downloaded updates use Restart now; an available update uses the existing download action. Automatic update ownership remains unchanged: the existing enabled, disabled switch truthfully reflects the current non-editable setting.

## Data and layout notes

- There is no persisted unread/last-viewed counter. “N new” is the count of existing feed items with `addedToQueue === false`; “since” is their earliest publication date. This represents unqueued items, not unseen items, and automatically queued items do not remain in that count. No backend/read-state semantics were invented.
- Dates follow Today/Yesterday plus locale time, short locale month/day in the current year, and YYYY-MM-DD in earlier years. Last-check values use `Intl.RelativeTimeFormat` with the app locale; missing last-check times are grey em dashes. Only positive new counts use `text-data`.
- Source list inset is 24px (12px panel inset + 12px row inset); page gutters are 24px. About uses the existing max-width screen column with 24px panel padding. Chat uses its existing 48rem composer/content column.
- Empty-state and About copy additions are inventoried in `i18n-screens.md`. Locale files were intentionally left to the orchestrator; the existing locale completeness check does not prove translations for default-only strings.

## Files owned by this lane

- `apps/desktop/src/renderer/src/pages/Subscriptions.tsx`
- `apps/desktop/src/renderer/src/pages/Chat.tsx`
- `apps/desktop/src/renderer/src/pages/About.tsx`
- `apps/desktop/src/renderer/src/components/agent/ChatSuggestions.tsx`
- `apps/desktop/src/renderer/src/components/agent/AgentChat.tsx` — local standalone composer state styling only
- `apps/desktop/src/renderer/src/components/kernel/DownloadEngineRow.tsx` — source search confirmed About is its only consumer
- `.taste-skill/i18n-screens.md`
- `.taste-skill/report-screens.md`

Existing and concurrent shell, Home/download, shared theme, UI, and other lane changes were preserved. This lane made no edits in Home/download components, `packages/ui`, or `packages/i18n`.

## Verification

- `cd apps/desktop && pnpm --config.verify-deps-before-run=false run typecheck:web` — passed.
- `pnpm --config.verify-deps-before-run=false exec biome check <the six source files above>` — passed, no fixes pending.
- `pnpm --config.verify-deps-before-run=false run check` — passed (desktop lint, locale completeness, node and web typechecks). One warning outside this lane: unstable `requestDeleteCaptions` hook dependency in `TranscriptCaptionsPane.tsx:1231`. Locale script also emits the existing MODULE_TYPELESS_PACKAGE_JSON warning.
- Impeccable mechanical detector over the six source files — `[]` (no findings).
- `git diff --check` — passed.
- Initial plain `pnpm exec` attempted an automatic dependency verification/install and reported a sandbox-inaccessible SQLite store. Subsequent checks disable only that pre-run install; dependencies and lockfile were not changed by this lane.
- **Visual/runtime verification pending:** CUA inventory reported `The browser access host is unavailable` and no available browser/app surfaces. No screenshot, responsive render, or live IPC interaction is claimed. In particular, long populated rows, composer CSS states, and narrow-width wrapping still need the orchestrator's visual pass.

Working branch inspected: `feat/taste-redesign`; base HEAD `fcf56aa706ebc20c43a55f7622c73854c80094a0`. All changes remain dirty for integration.
