# Subscription baseline goldens (phase 6a)

## Progress

- [x] Read shared lane requirements, locked plan, port/golden guides, loopback report and the complete sibling subscriptions design.
- [x] Canonical offline baseline launch succeeds on a disposable scratch profile.
- [x] Explore proposed public scenarios and inspect the recorded baseline outcomes.
- [x] Record 18 new cases without changing the existing 379 documents.
- [x] Twenty consecutive focused comparisons and five consecutive complete comparisons.
- [x] Repository gates, DNS audit, timing, restored CLI output and scratch handoff.

The read-only baseline is the main checkout's `apps/desktop/dist/linux-unpacked`;
this lane starts at `9dab889`. Only harness, fixtures, goldens and documentation
are in scope. No owner application or live profile is used.

## Exploration findings

The first manual public probe used the canonical offline launcher and a synthetic
profile. Raw responses are retained in scratch `explore-public/subscriptions-core/`.
RSS and Atom each expose two usable items with fixed identity/date/link mapping.
The redirect resolves relative alternate links against the final HTML URL and
reports the corrected direct RSS URL. Invalid XML preserves its initial parser
error. Disabled creation stores no items; an explicit refresh while disabled
fetches and persists both entries with status `up-to-date`. Exact and
fragment-equivalent feeds are rejected as duplicate feeds.

The baseline replaces an automatically chosen feed title and source URL with the
channel link on refresh. That observed behavior is preserved. Download runs show
successful automatic admission and manual queue/repeat/remove/requeue. Public
MCP task summaries omit priority and input options; the automation task `get`
response exposes them and is used to pin the actual admission contract.

An exploratory comparison (before recording) reached revision successfully but
failed a harness assertion because `list_tasks` exposes `groupKey`, not a nested
`input.subscriptionId`. Filtering now uses the public group key. Missing-golden
messages during these exploratory comparisons are expected and do not count as
acceptance failures.

## Case boundary

Eighteen documents are recorded on the baseline (17 scenario documents and one
reopen document), bringing a complete invocation to 397 comparisons. All 379
existing tracked golden files remain unchanged. The last recording after explicit
subtitle-language pinning took 51.1 seconds
under concurrent load, including bootstrap, fixture generation, the overlapping
real 30.5-second dedupe interval and physical-profile restart.

| Documents | Evidence pinned |
| --- | --- |
| `probe-rss`, `probe-atom` | Exact probe identity/date/link mapping, counts, metadata and completed XML requests |
| `probe-discovery`, `probe-failed-candidates`, `probe-invalid-xml` | Redirect/final-page relative URL resolution, initial parser errors, serial candidate attempts and the three-candidate cap |
| `create-read`, `duplicate` | Disabled discovered/manual and direct/automatic creation, empty snapshots, defaults/preferences, get/list and exact/fragment-equivalent duplicate rejection |
| `refresh-items`, `refresh-revision` | First actual fetch and pagination; same-subscription A→B replacement, dropped/new/retained identity proof and retained queue link; MCP and HTTP refresh dispatch |
| `auto-download`, `refresh-no-duplicate` | Initial two automatic admissions, full automation task input/options/priority/group, completion/files/history/links; later real fetch with unchanged links/history and exactly two group tasks |
| `manual-queue`, `remove-task-requeue`, `seen-after-removal` | Manual admission, existing-link repeat, public removal/link clearing/new task, then real automatic revision refresh without readmitting the seen item |
| `remove-read`, `remove-pending` | Removed get/items errors and list; running and queued subscription tasks cancelled through public subscription removal |
| `renderer` | Successful item visible on subscription route in explicit CDP viewport; no renderer error/exception |
| `reopen` | Same physical database/config/items; one deliberately orphaned synthetic link cleared at startup, valid completed link retained |

All fourteen proposed section-10 table scenarios are covered; none lacks a golden. Scheduling while
enabled, the full 180-second timeout, native service semantics, real websites,
authentication and future port builds are outside this baseline golden lane.
Disabled public one-ID refresh is deliberate: it bypasses enabled/due guards and
keeps periodic scheduling from consuming the intended trigger.

Every explicit refresh awaits a fresh completed XML response, public settlement
and persisted successful state; later refreshes must advance `lastSuccessAt`.
The monotonic dedupe deadline is conservatively measured from the previous public
refresh's completion, after the accepted scheduler trigger. Publication dates and
latest-publication metadata remain literal; only named check-clock fields are
normalized. Progress/log values retain the established download-suite projection.

The headless app initially has a 1×1 viewport: a raw screenshot confirmed this.
A 1280×900 CDP viewport makes the virtualized successful item visible; no product
code or display permission was changed. An exploratory removed-item read also
confirmed the public error `Subscription not found`, which is now pinned rather
than expecting an empty list. Exploratory diagnostics precede acceptance counting.

## Integration diagnostics before acceptance

The first complete comparison exposed four new-document mismatches only: the
original suite had selected subtitle languages `en,fr`, while the focused profile
default was `interface`. The subscription scenario now explicitly pins
`subtitleLanguages: ["interface"]` through public settings before admission.
The saved task options remain literal; no normalization hides the difference.
All existing documents compared unchanged. The 20/5 acceptance count starts only
after this correction and a successful complete integration comparison.

The first corrected full integration passed all 397 comparisons in 92.484 seconds;
two diagnostic focused comparisons then passed in 39.172 and 38.625 seconds.
A cleanup audit found that startup recreated the removed subscription output
alias as an empty physical directory. All six earlier owned directories were
inspected, found empty and removed individually with `rmdir`. No media escaped
the run. The restart fixture now recreates the exact alias as a symlink before
restart, and the runner removes it after the restarted app stops. The batch was
intentionally interrupted during the next invocation; these diagnostics are
preserved separately and do not count toward final 20/5 acceptance. No golden
content changed for this cleanup correction.

A separate negative control used a fresh offline profile and served revision B
for the unchanged `probe-rss` revision-A expectation. The public MCP probe and
normal comparator rejected ten meaningful title, item identity/link/date and
request-revision differences. `negative-control/subscriptions-core/regression-comparison.json`
in scratch preserves this receipt. No committed golden, product source or
acceptance input was modified. This is a fixture-regression control, not a test
of a future port build.

After all twenty focused comparisons passed, the first full acceptance attempt
failed twelve existing documents. The seeded `golden-processing` task reported
`Temporary failure in name resolution` instead of the existing expected
`Connection refused` text. All seventeen new subscription scenario documents
passed; the harness correctly stopped before restart. The command took 117.073
seconds. Its DNS log includes a four-second gap between `example.invalid` A and
AAAA entries; the offline resolver has a one-second, one-attempt timeout. This
is consistent with a transient scheduling/DNS timeout under load; the precise
scheduling cause is not proven. No error text, existing golden or launcher
setting was changed. The failure remains in `acceptance/full-01.log`, and the
five-full passing sequence is counted afresh after it.

## Final acceptance and timing

Twenty consecutive focused comparisons and five consecutive full comparisons pass
on the final, unchanged harness: **2,345 accepted document comparisons**. No new
case failed or was removed for instability. The earlier full DNS failure remains
reported above and is excluded from the five-pass sequence.

| Scenario | Runs | Documents per run | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| focused | 20 | 18 | 38.345s | 39.600s | 48.237s |
| full | 5 | 397 | 90.415s | 91.512s | 98.193s |

All full passes remain below the approximately three-minute target. Whole-command
timings include launcher shutdown and cleanup. The new subscription stage adds
approximately **32.121 seconds median** (31.957–32.526s), measured
from the last existing scenario document write to the last new document write in
each accepted full run. This measures the added scenario stage, including the
overlapping real dedupe wait; it is not a paired build benchmark or a measurement
of every millisecond of fixture/reopen overhead.

Each row below exits 0. Evidence names are relative to scratch `acceptance/runs/`;
`acceptance/determinism.json`, per-run logs and `acceptance/final-summary.json`
retain exact UTC starts, command timings and comparison counts. The additional
93.365-second complete integration diagnostic is excluded from these counts.

| Scenario | Run | Evidence | Seconds |
| --- | ---: | --- | ---: |
| focused | 1 | `suite-JU9SrE` | 38.599 |
| focused | 2 | `suite-mupdcU` | 38.345 |
| focused | 3 | `suite-m9PC6y` | 39.379 |
| focused | 4 | `suite-Cn2dlm` | 39.583 |
| focused | 5 | `suite-fok87f` | 39.190 |
| focused | 6 | `suite-Sp5Y2a` | 38.944 |
| focused | 7 | `suite-g6zz6H` | 38.892 |
| focused | 8 | `suite-SEImcS` | 39.617 |
| focused | 9 | `suite-LciPyD` | 39.660 |
| focused | 10 | `suite-NTBM2h` | 39.285 |
| focused | 11 | `suite-WjQYZJ` | 40.055 |
| focused | 12 | `suite-8FtMos` | 38.942 |
| focused | 13 | `suite-Mha5kg` | 44.940 |
| focused | 14 | `suite-eFkt2w` | 40.934 |
| focused | 15 | `suite-5Ehoo2` | 40.134 |
| focused | 16 | `suite-pRPOo4` | 48.237 |
| focused | 17 | `suite-vXwPp5` | 39.935 |
| focused | 18 | `suite-XQ62zQ` | 40.422 |
| focused | 19 | `suite-Tedpm6` | 40.978 |
| focused | 20 | `suite-VRoB6n` | 39.311 |
| full | 2 | `suite-0P36Un` | 93.802 |
| full | 3 | `suite-nItzRs` | 98.193 |
| full | 4 | `suite-QWrw59` | 90.415 |
| full | 5 | `suite-0Ciu7j` | 91.512 |
| full | 6 | `suite-c6Wg4a` | 90.611 |

## DNS and cleanup audit

The audit read **all 114 DNS logs** from this lane's preflight, exploration,
recordings, diagnostics, negative control and final attempts, including the
failed full run. Every log has logger readiness and its self-test; no DNS logger
error was recorded. The final 26 passing invocations have 78 DNS logs: 75 for the
accepted 20/5 sequence and three for the additional integration diagnostic.

Focused subscription invocations attempted these eight hostnames:
`selftest.dns-logger.invalid`, `redirector.gvt1.com`, `github.com`, `ghfast.top`,
`gh-proxy.com`, `www.modelscope.cn`, `example.invalid`, and `favicon.im`.
Full invocations add `api.vidbee.org` through the existing account cases. The
union is exactly the original suite's nine-host set: **no new hostname**. New
feed/media routes use numeric loopback addresses. Every app launch remained in
the canonical offline namespace.

`acceptance/acceptance-audit.json` verifies same-physical-database reuse, removed
output aliases, completed subscription-response logging and zero unexpected
application errors for every final-version passing invocation. The failed full
run stopped before restart, so no restart proof is claimed for it. The aggregate
`all-dns-audit.json` includes that failure and all earlier diagnostic runs.

## Gates and scope

All final commands use pinned Node **v22.23.4** and exit 0:

- `bun run check`: twelve ported configurations, zero violations. The existing
  transcript hook-dependency warning remains; no diagnostic was lowered.
- `bun run test`: node audit 579 passed / zero failed; thirteen Turbo tasks;
  four checker/schema tests; final six Vitest files / 83 tests, including the five
  new server/normalization contracts. Existing database-mode skips are unchanged.
- `bun run deps:check`: no issues.
- `bun run port:check`: twelve ported configurations / zero violations.
- Focused new and existing loopback server tests: twelve passed.
- `bun run --cwd apps/cli build`: succeeds; its tracked generated bundle is
  restored byte-for-byte afterward, with matching git blob hashes.

Initial checks caught edited-file/new-document formatting, which was corrected
only in those files. Final scope checks show no application/package source diff,
no existing golden diff, no staged change and no remaining output alias. The
new root test-script entry is a minimal harness registration. No dependency,
commit, push, package installation or owner application/profile change occurred.
A new desktop build, the future port's build and hosted CI remain outside this
assigned pre-port baseline proof.

The final scope audit also found the dangling alias left by the deliberately
interrupted pre-fix diagnostic after its scratch directory was moved. Its exact
owned target was verified and the link removed. Both existing and dangling alias
names are absent in the final check; this does not affect the completed final
26-invocation cleanup proof.
