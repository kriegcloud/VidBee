# Owner review

Choices the port made in the owner's place (see "Amendments" in [PLAN.md](PLAN.md)), bugs found and
not fixed (assumption A2), and dependencies held back. One entry each, newest phase last.

| # | Phase | Kind | Entry | Reason |
| --- | --- | --- | --- | --- |
| 1 | 0b | held back | `electron` stays at 43.8.10 (latest 45.3.3) | Electron 44 replaced the clipboard module; copying a file to the clipboard would need a rewrite that cannot be verified on three platforms. |
| 2 | 0b | held back | pi packages (`pi-ai`, `pi-agent-core`, `pi-durable`, `pi-tui`, `chord`) stay at 1.4.0, `typebox` at 1.3.27 | pi 1.5 removed `watchEvents()` and the event stream the chat session is built on. |
| 3 | 0b | held back | `electron-ipc-decorator` stays at ^0.2.0 | 1.0 breaks about 200 renderer call sites and the port removes the library. |
| 4 | 0b | held back | `lucide-react` goes to ^0.577.0, not 1.x | 1.0 removed the brand icons five files use; replacing them changes the look. |
| 5 | 0b | held back | `@biomejs/biome` 2.5.15 and `ultracite` 8.0.2 | 1,116 new lint errors; phase 1a replaces both. |
| 6 | 0b | bug | Fresh profile logs `no such table: transcript_prompt_runs` from the video library backfill | `video-library-host.ts` reads the table before `ai-prompt-store.ts` creates it. Warning only. |
| 7 | 1a | choice | The rule set has 150 diagnostics (145 `error`, 5 `off`), not the plan's 187 all-`error` | `tsconfig.base.json` is copied from beep-effect unchanged, as the plan requires; the plan's count was stale. The five `off` rules are off in the reference. |
| 8 | 1a | choice | `port:check` also rejects suppression comments, `new Map`/`new Set`, `node:http` and `zod` imports in ported units | The plan asks for greps on checklist items 2 and 3 only; these add the standing rules so they are enforced mechanically. |
| 9 | 1a | choice | `@biomejs/biome` pinned to 2.5.6 (was 2.5.15) | D26: pin what beep-effect pins. |
| 10 | 1a | choice | ultracite's two presets are vendored under `standards/biome-legacy/` until phase 10 | Unported code keeps today's lint and formatting without the dependency. |
| 11 | 1a | choice | `@vidbee/schema` replaces `@beep/utils` and `@beep/identity` with public Effect modules instead of copying helpers | Nothing beyond `LiteralKit` needed copying. |
| 12 | 1b | choice | The golden harness is plain Node `.mjs` under `apps/desktop/scripts/port/golden/`, not TypeScript | D7 keeps build scripts in JavaScript; a harness with no dependency on the toolchain survives every phase unchanged. |
| 13 | 1b | choice | Goldens normalize ids, timestamps, ports, pids, tokens, run paths, durations and the ffmpeg build id; everything else is literal | See the phase 1b report for the rules. |
| 14 | 1b | bug | The automation `add` endpoint accepts a task of unknown kind without a URL (HTTP 200); the renderer then throws on `url.trim()` | Pinned by a golden as it behaves today; not fixed (A2). |
| 15 | 1b | choice | Not covered by goldens because they need the network or are not deterministic: successful downloads, feed refresh, AI generation, model downloads, extension caption/overview success, cookie long-poll delivery, rendered PDF/PNG/video exports, local ASR | Their validation and error answers are pinned; later phases exercise the success paths by hand where they can. |
| 16 | 2 | bug | System locale detection reads `LANG` before `LC_ALL` and `LC_MESSAGES` | Most tools give `LC_ALL` priority. Pinned as it behaves today; not fixed (A2). |
| 17 | 2 | bug | `normalizeLanguageCode("zh-HK")` returns `zh` while `languageFromTag("zh-HK")` returns `zh-TW` | The two helpers disagree on Chinese regions. Pinned; not fixed. |
| 18 | 2 | bug | Forcing a language with `VIDBEE_LANGUAGE` on a Chinese host locale can drop the "prefer China mirrors" flag | The forced language is treated as the primary locale. Pinned; not fixed. |
| 19 | 2 | choice | The 14 locale files are validated against a schema in tests, not decoded at app start | They are bundled, immutable assets; decoding them on every launch would cost startup time for no safety gain. |
| 20 | 2 | choice | `react-i18next` removed from `packages/i18n`'s manifest | The package never imports its runtime; the consuming app passes its own binding. |
| 21 | 3 | choice | D30: `node:sqlite` is the target driver, adopted at one cutover in phase 9.5 or 10; until then one `better-sqlite3` connection behind a `SqlClient` adapter | The spike passed for `node:sqlite` alone and failed for the two drivers on one file in one process (an acknowledged write was lost). The spike's own recommendation was to keep `better-sqlite3` for good. See the phase 3 report and `design/db.md` section 2. |
| 22 | 3 | choice | Design gate for `db` passed by an independent review (GPT-6 Astra), 9 findings resolved | Amendment to D14. Recorded in `design/db.md` section 9. |
| 23 | 3 | choice | An existing database gains two columns (`name`, `applied_at`) in `__drizzle_migrations` on first launch | Done by Drizzle 1.0's migrator. No application table changes; the previous build still opens the database (tested). |
| 24 | 3 | choice | A row with a non-finite number, or NULL in a text primary key, fails to decode in ported code | The rule set rejects `S.Number`, and the models follow the Drizzle types. SQLite can store both; no writer does. No ported consumer reads rows yet. |
| 25 | 3 | choice | A test-only alias dependency on `drizzle-orm@0.45.4` in `packages/db` | It runs the previous build's migrator in the rollback tests. Remove it when rollback to a pre-1.0 build no longer matters. |
| 26 | 3 | bug | `drizzle-kit generate` proposes `DROP TABLE download_history` | Snapshot drift from before the port. Do not apply generated migrations until reconciled. |
| 27 | 3 | bug | Eight differences between Drizzle table objects and the real schema; `words_json` added only on the transcript applier's second call | Pinned by tests as they are; see the phase 3 report. |
| 28 | 4 | choice | The old task-queue API lives in an unported sibling package, `packages/task-queue-legacy`, not in a `legacy` entry of the ported package | The rule set checks `legacy/` directories too; the old API needs synchronous Node calls, timers, zod and `Set`s that would require suppressions. The package is temporary and deleted in phase 10. See `design/task-queue.md` section 2. |
| 29 | 4 | choice | Design gate for `task-queue` passed by two independent reviews (GPT-6 Astra), 17 findings resolved | Amendment to D14. Recorded in `design/task-queue.md` section 11. |
| 30 | 4 | choice | From phase 5 on, a first design draft is prepared from a source inventory by a delegated session under the orchestrator's written directive; the orchestrator takes the open decisions and the independent review follows as before | The remaining packages are too large to hold in one session's context together with the run. Decisions and review findings are still resolved by the orchestrator and recorded in each design. |
| 31 | 4 | change | A persisted task row that fails its schema is skipped and logged instead of loaded unchecked | Declared change 1 of the phase 4 report. All 820 real task rows decode. |
| 32 | 4 | change | The `SyntaxError` for a corrupt JSON column has a new message naming task and column | Declared change 2. `globalJson` forbids `JSON.parse`, and Schema's JSON decoding replaces the engine's error. |
| 33 | 4 | change | Caught-error log lines have the logger layer's shape | Declared change 3. |
| 34 | 4 | change | Under `better-sqlite3` safe-integer mode every integer column becomes a number | Declared change 4. No host enables the mode. |
| 35 | 4 | choice | The kernel keeps a suspension point (`LegacyTiming.turn`) wherever the old code awaited, real in the compatibility package and a no-op natively | Unported callers and 382 tests depend on promise-level interleaving. It is scaffolding to remove when the last legacy consumer is gone. |
| 36 | 4 | choice | The golden suite grew from 358 to 379 cases with real downloads from a loopback server; suite time went from about 25 to about 63 seconds | Download success paths were unpinned before. Recorded on the pre-port build. |
| 37 | 4 | bug | Task-queue quirks pinned as they are (retry budget by maximum, failed-start latch, restart after stop, orphan event signal, `importCompleted` bypassing guards, per-group cap reset, illegal panic fallback, `NaN` timestamps accepted) | Listed in the phase 4 report; not fixed (A2). |
| 38 | 4 | bug | `--trim-filenames 120` truncates the full output path; MP3 requested from a direct WAV URL saves WAV; `durationMs` stays null; raw automation `add` skips the prepared settings | Found by the download golden cases; pinned, not fixed. |
| 39 | 4 | bug | `docs/audits/2026-09-09-bugs-performance.md`, committed before the port, contains an absolute home path | The repository is public. Not touched by the port. |
