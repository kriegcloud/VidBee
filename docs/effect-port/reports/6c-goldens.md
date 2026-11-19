# Transcription baseline goldens (phase 6c)

## Progress

- [x] Read the complete lane brief, shared rules, design, plan and port/golden guides.
- [x] Verify clean starting worktree at `9dab889` and the existing offline baseline.
- [x] Inventory the complete supplied model set and pin SHA-256 checksums.
- [x] Explore representative behavior for all eight scenarios through public surfaces.
- [x] Extend package-specific fixtures/cases and record two stable model-management answers.
- [ ] Required real-ASR goldens: blocked by baseline provider selection; no ASR acceptance claimed.
- [x] Complete twenty model-contract comparisons and five original-plus-model complete comparisons.
- [x] Audit DNS logs, preserve all existing goldens and finish repository gates.
- [x] Write the scratch handoff with scenario gaps and review findings.

## Scope and provenance

The branch is `port/goldens-6c`, starting at `9dab889` (merged downloader-core).
The read-only baseline is
`~/YeeBois/workstation-apps/VidBee/apps/desktop/dist/linux-unpacked`.
Baseline `resources/app.asar` SHA-256:
`c7e7945ebcea629965cfd67c5fef5894618fda008a11a63680eb0c83c69d8490`.
Only harness, fixture, golden and documentation changes belong to this lane.
The owner's running app and live profile are outside this work.

The unchanged harness preflight used `--loopback-only --subset loopback`, without
models or update, and passed all 21 comparisons in 27.7 seconds. Its evidence is
`scratchpad/lanes/6c-goldens/preflight/suite-0KoZRX` under the supplied session
scratch root. Schema bootstrap, main run and restart used isolated profiles and
loopback-only network namespaces.

## Pinned model and speech prerequisites

The supplied model root contains 27 regular files totaling 220,662,492 bytes.
It includes Silero VAD; pyannote segmentation 3.0 (float and int8 files); CAM++
speaker embedding; Whisper tiny int8 encoder/decoder/tokens; and CT transformer
Chinese/English punctuation int8 dated 2024-04-12 with configuration and tokens.
No model was fetched. The exact set, including ancillary files and speech samples,
is pinned in `transcription-models.json`; `verifyTranscriptionModels` rejects any
added, missing, changed or non-regular entry before recording/comparison.
These hashes establish byte identity, not publisher authenticity or a general
redistribution licence.

The separately supplied `sample0.wav` is byte-identical to
`transcription/sherpa-onnx-whisper-tiny/test_wavs/0.wav`, SHA-256
`6bc58a4efdf20daac252b6b1502632601a71efe0308f6757dc1eda34891a7e4f`.
No sample redistribution licence has been established. Spoken bytes remain
external, read from the supplied model tree; no weights or speech bytes are
committed. Hosted omission cannot satisfy the local real-ASR gate.

| Model-relative file | SHA-256 |
| --- | --- |
| `transcription/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx` | `aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2` |
| `transcription/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/README.md` | `c4653586d436602e27aa3f12b080fe4417600204193ad46ed1235b42c20f6936` |
| `transcription/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/add-model-metadata.py` | `40bf1e82588729b2516cdb49e2485cf6d990596255a1daa527265f29065c4a2c` |
| `transcription/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/config.yaml` | `a56ec10925b06fa976ad51af373396be2b13e1eb8dc62a5426b5adebaba7071d` |
| `transcription/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/model.int8.onnx` | `65a3fb9f5ad7bfb96bf69e0dc4481df97f6ee60513c1d94ce981ba6effd524b1` |
| `transcription/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/show-model-input-output.py` | `d8f3bb6c445b5604088429f3fa2318709bf88c97040ceca1083de11109de29e6` |
| `transcription/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/test.py` | `0de2c8e8369370a2ec0a86c6d46083fe93a0af73a6c2d8c25c72c801b7253af4` |
| `transcription/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12-int8/tokens.json` | `c960ab87bccea4aa15cf49a59f71973c2c330b46668048cd8da253749ec71ee3` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/LICENSE` | `14d7016ad68e7394d6e6b78d96cc2ae431c905287b89674cfdf021e79e62b8ba` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/README.md` | `0380ed76a50efcc421dc62f251ed06e8349688466beac3177bee6e00dc336bfc` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/export-onnx.py` | `21df426fc6ca2ad54b5c9e114729990e0a669d602ea4e052f38287f99d32c0b0` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx` | `d582f4b4c6b48205de7e0643c57df0df5615a3c176189be3fc461e9d18827b5d` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/model.onnx` | `220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/run.sh` | `5844c56ec90b29d0f01056f81e3f66f84ed4ef598bfc8705f86cd290d73138b3` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/show-onnx.py` | `ace74dd3749e345cfac03a2d869830a99e7425ebc100545d7e8b2b95568ee575` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/speaker-diarization-onnx.py` | `51e301c2d02c87351a22582e51e883d4f18e4755d193587e69e1fd7f357132e7` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/speaker-diarization-torch.py` | `72f9fa5dd9f4966869acf79ef3b1328398434c70373f462d373895757aa0fae7` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/vad-onnx.py` | `4fbd5d74faf7bb34133f3268d1f184f9a43bfa3e3220acf1dbec7e9bef41e848` |
| `transcription/sherpa-onnx-pyannote-segmentation-3-0/vad-torch.py` | `ecd6d40be0229624b7a312a1e2a3cffddeaf432706395df26c76fe588bf8dc66` |
| `transcription/sherpa-onnx-whisper-tiny/test_wavs/0.wav` | `6bc58a4efdf20daac252b6b1502632601a71efe0308f6757dc1eda34891a7e4f` |
| `transcription/sherpa-onnx-whisper-tiny/test_wavs/1.wav` | `5143a6ba93c4b274e2c4ac22deb75c2c48936c853f0519add1de828b6c79cc5a` |
| `transcription/sherpa-onnx-whisper-tiny/test_wavs/8k.wav` | `f6f3c8b33e2534cdc154fe773ad2750f1f6a2ca5096179cdf037ae782456613e` |
| `transcription/sherpa-onnx-whisper-tiny/test_wavs/trans.txt` | `b9ac44e7b794abb1a2d5faf0005e98a665971e7ac2ed15435832cc34edaa9100` |
| `transcription/sherpa-onnx-whisper-tiny/tiny-decoder.int8.onnx` | `d2fece8dd42771f1df975c6c0445770d0c292bf7547c2cae04a6c0cc57540925` |
| `transcription/sherpa-onnx-whisper-tiny/tiny-encoder.int8.onnx` | `d24fb083ae3b1041fc24e97971d60e280c9342201fbb67b0ab428a8b4a51a434` |
| `transcription/sherpa-onnx-whisper-tiny/tiny-tokens.txt` | `b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126` |
| `transcription/silero_vad.onnx` | `9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6` |

## Generated fixture checksums

These checksums matched across two fresh builds using the baseline's bundled
FFmpeg and the same external model tree. The speech copy is externally supplied;
the other media are generated by the builder. The two-clip output concatenates
the supplied sample clips and remains external test material.

| Fixture | SHA-256 |
| --- | --- |
| `captions.mkv` | `0e84b187b870678752638b67157d64cf67277debb5a277413f3f7058d3a137df` |
| `deu.srt` | `d8691d3415c81e08db2c471303243a004a91147efb75e448f58e27b7ef19eb9b` |
| `eng.srt` | `c7eec87a821670a2a03c1143d413ca7cfcbc13b9083943e62887c4529a2a994e` |
| `long.wav` | `847f18a047719a5ce78dbeaefaa94116776ece18c262303c1e1101a2e51a7e11` |
| `silence.wav` | `f751fd7094be088dc785125e4a1a0222a17c2bd20469aa31728ca5e515ed5809` |
| `speech.wav` | `6bc58a4efdf20daac252b6b1502632601a71efe0308f6757dc1eda34891a7e4f` |
| `two-clips.wav` | `2119410f5ccaa8e10c95fbaf3f2db13bcfe1524e3d0f34e4b16c25101c71ee27` |

## Exploration, accepted cases and determinism

The first complete-model ASR exploration (`exploration/suite-knMYWG`) completed
in a 29.5-second invocation. Public `import_media` starts ASR even when
`autoTranscribeAfterDownload=false`; that setting controls download completion,
not local import. The fixed 16 kHz speech returned one speaker and one segment,
0–6625 ms, with an empty word array. Exact raw public answers are retained in
`run/transcription-exploration.json`.

A later recording attempt (`exploration/suite-WWLnaJ`) failed the mandatory CPU
assertion. `get_task` reported `compute.provider=cuda` while its same log reported
`Available providers: CPUExecutionProvider, . Fallback to cpu!`. This is not an
accepted CPU recording. The GPU-disabled launcher alone does not establish the
app-reported CPU prerequisite.

Source inspection explains the observed instability: on Linux x64 with empty
GPU inventory, `sherpaProviderCandidates` still offers CUDA before CPU.
`PROVIDER_FALLBACK_PATTERN` matches “fall back” or “falling back”, but misses
“Fallback to cpu!”. Both provider probes can therefore measure CPU decode, and
small timing differences can select the nominal CUDA provider. The selector's
five-percent timing margin is preserved. No app source, provider setting, probe,
model, golden expectation or normalization was changed to conceal this failure.

Real-ASR phase acceptance is blocked by this baseline behavior. The remaining characterization and stable independent contract repeats are complete;
their proof below is separate from the unmet ASR gate.

## Determinism results and DNS audit

All **20 consecutive model-contract comparisons** and **five consecutive combined
complete comparisons** passed, with zero accepted-comparison failures and no
favorable-provider retries counted. The isolated selector compares two documents;
each combined run compares the original 379 on its own profile and those same two
model documents on a separate supplied-model profile. Total: **1,945 accepted
document comparisons**. This is explicitly restricted model-management proof,
not the required real-ASR repeat gate.

| Scenario | Runs | Documents/run | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Model contracts | 20 | 2 | 25.855s | 28.456s | 41.487s |
| Original suite plus model contracts | 5 | 381 | 83.611s | 90.401s | 93.379s |

Times are whole-command receipts including disposable schema bootstrap, fixture
creation, launch, comparisons, restart and cleanup, on a shared workstation.
`determinism-results.json` and the individual logs retain the exact receipts.
All rows below have exit code 0; neither comparison phase used `--update`.

| Scenario | Run | Seconds | Scratch receipt |
| --- | ---: | ---: | --- |
| contracts-20 | 1 | 41.487 | `contracts-20/01.log` |
| contracts-20 | 2 | 29.004 | `contracts-20/02.log` |
| contracts-20 | 3 | 28.216 | `contracts-20/03.log` |
| contracts-20 | 4 | 35.222 | `contracts-20/04.log` |
| contracts-20 | 5 | 39.032 | `contracts-20/05.log` |
| contracts-20 | 6 | 34.252 | `contracts-20/06.log` |
| contracts-20 | 7 | 34.040 | `contracts-20/07.log` |
| contracts-20 | 8 | 28.449 | `contracts-20/08.log` |
| contracts-20 | 9 | 26.977 | `contracts-20/09.log` |
| contracts-20 | 10 | 28.913 | `contracts-20/10.log` |
| contracts-20 | 11 | 27.455 | `contracts-20/11.log` |
| contracts-20 | 12 | 25.855 | `contracts-20/12.log` |
| contracts-20 | 13 | 26.474 | `contracts-20/13.log` |
| contracts-20 | 14 | 29.330 | `contracts-20/14.log` |
| contracts-20 | 15 | 28.244 | `contracts-20/15.log` |
| contracts-20 | 16 | 28.464 | `contracts-20/16.log` |
| contracts-20 | 17 | 28.069 | `contracts-20/17.log` |
| contracts-20 | 18 | 28.692 | `contracts-20/18.log` |
| contracts-20 | 19 | 27.705 | `contracts-20/19.log` |
| contracts-20 | 20 | 26.844 | `contracts-20/20.log` |
| full-5 | 1 | 83.985 | `full-5/01.log` |
| full-5 | 2 | 83.611 | `full-5/02.log` |
| full-5 | 3 | 91.214 | `full-5/03.log` |
| full-5 | 4 | 90.401 | `full-5/04.log` |
| full-5 | 5 | 93.379 | `full-5/05.log` |

`acceptance-audit.json` independently checked all 25 result receipts, each
supplied-model manifest, the two normalized actual documents against their
goldens, each original primary/restart document count, and DNS logger readiness
and self-test in all **90 accepted launch logs**. It reports `realAsrAccepted=false`
as well as its passing model-contract result.

The broader audit read **115 retained DNS logs**, covering preflight, development
failures, explorations, recording and accepted repetitions. The union is exactly:
`selftest.dns-logger.invalid`, `redirector.gvt1.com`, `github.com`, `ghfast.top`,
`gh-proxy.com`, `www.modelscope.cn`, `example.invalid`, `favicon.im`, and
`api.vidbee.org`. **No new hostname** appeared compared with the existing suite.
All app launches used the unchanged loopback-only network namespace; DNS evidence
shows attempted names, not successful external access. Numeric transcription
media URLs add no DNS dependency. Raw logs and per-log name sets are retained in
`evidence-audit.json`.

The final preservation checks found no application/package source diff, no
tracked existing-golden diff, no staged changes, no remaining owned temporary
loopback alias, and a byte-identical tracked CLI bundle. The baseline app.asar
hash still matches the starting hash. `git diff --check` passes.
`preservation-audit.json` retains the final structured receipts.

## Public exploration findings

The corrected all-scenario exploration is `exploration/suite-yEcTyy`, 40.4 seconds.
`VIDBEE_TRANSCRIPTION_EXPLORE=1` disabled transcription recording and the CPU abort
for characterization only; it accepted zero transcription golden comparisons.
All successful workers in that particular run reported CPU, but that favorable
observation does not resolve the failed run or establish determinism.

- Local public import admitted a completed media record and a transcription child.
  The 6.625-second speech produced one segment and an empty word array. Explicit
  rediarization with counts 1 and 2 preserved text and created replacement records.
- Explicit force admitted a new transcription task while prior transcripts remained
  readable. A second forced task was held queued behind a recognizing long-speech
  task; the source was renamed within its own fixture directory, and the long task
  was cancelled. The queued task then failed with missing-source ENOENT. Restoring
  the same bytes and public retry reused that task ID and completed at attempt 1.
  Do not invent an attempt increment from the API action name.
- Long-speech cancellation waited for public recognizing evidence. It returned
  cancelled with no transcript committed for that import. Inside the same owned
  namespace, `transcription-workers-active.json` captured the worker process;
  `transcription-workers-released.json` was empty before launcher shutdown. This
  supplies a worker-release observation independent of launcher cleanup.
- Loopback silence downloaded successfully and admitted an automatic transcription
  child, producing `no-speech` with zero segments. The task output held a persisted
  transcript ID while the public detail showed `transcriptId=null` and
  `resultKind=null` for its no-speech display state. Both are observed behavior.
- The loopback Matroska fixture exposed English and German caption choices plus
  ASR. English captions were selected by default. Source switching worked and
  caption rediarization ran at both requested counts. Count 1 produced one
  speaker; count 2 could return an empty speaker list for this fixture.
- Punctuation processing changed synthetic English caption text to
  `Alice : A synthetic caption .。`. That text is retained in raw evidence. A label
  in cue text is not proof of a named-speaker parser result. The initial fixture's
  `[AI]` cue text also did not prove source metadata's AI-tag distinction.
- Restart reopened the same physical synthetic profile through the existing
  launcher's restricted symlink mechanism. The initial corrected exploration ran
  restart reads; `exploration/suite-rrTgyU` (45.3 seconds) retains
  `restart/transcription-restart-readback.json` separately. ASR was selected before
  restart, but the reopened profile selected latest German captions. View source
  selection is not durable in this baseline; this is a finding, not normalized
  parity. Speech and silence records remained readable.

The second corrected exploration also imported a two-clip variant assembled from
external `test_wavs/0.wav` and `1.wav`. Automatic diarization returned two speakers
and three segments at 0–6551, 6551–15000 and 15000–23340 ms. Fixed-count 2
rediarization preserved that text/timing and two speakers. This is an actual
multi-speaker observation, still excluded from accepted ASR repeat proof.
Generated silence, long speech, two-clip media and caption-container bytes use
FFmpeg bitexact flags. `fixture-determinism/sha256.json` records equal hashes from
two fresh builds. The first corrected exploration's physical SRT export was read:
138 bytes matched the public response's 138 bytes; content/hash evidence is in
`run/transcription-export-physical.json`.

Public events were subscribed before admission. All waits are bounded polls for
conditions, not fixed sleeps. Raw requests/responses, events, loopback request
logs, worker observations and the synthetic profile stay in scratch. The initial
physical-persistence projection checked database presence only; it is not a SQL
integrity or row-by-row comparison. Successful restart API readback is the actual
persistence observation.

## Design-table coverage and remaining gate

Only two independent model documents are retained as accepted goldens:
`transcription/model-ready` and `transcription/model-installed-ensure`. The latter
pins the public model-download task's completed output for an already-installed
minimal tier, without a required model transfer. These cases do not run native
recognition and have no compute-provider report to assert. They cannot count as
accepted real-ASR recordings.

| Design scenario | Current proof | Why there is no accepted real-ASR golden |
| --- | --- | --- |
| `transcription-local-complete` | Successful public speech import, transcript and SRT export explored | Mandatory app-reported CPU selection is unstable; no twenty-run ASR sequence |
| `transcription-auto-no-speech` | Automatic child after loopback silence and empty no-speech result explored | Same provider prerequisite; no accepted repeat proof |
| `transcription-auto-caption` | Two embedded languages, selection and source switching explored | Successful worker still needs the same CPU prerequisite; named-speaker/AI-source distinction also remains incomplete |
| `transcription-rediarize` | ASR and caption records rediarized at counts 1 and 2 | Same provider prerequisite; no accepted repeat proof |
| `transcription-cancel-active` | Recognizing evidence, cancellation, no replacement and worker release explored | Native lifecycle not admitted into a deterministic CPU baseline |
| `transcription-force-and-retry` | New forced task, queued missing-source failure, restore and same-task retry explored | Same provider prerequisite; no accepted repeat proof |
| `transcription-restart-readback` | Same physical profile reopened and public records read | Depends on unaccepted successful-ASR/caption mutations; no accepted repeat proof |
| `transcription-model-ready` | Readiness and installed ensure are retained independently | Two model-management goldens only; these establish no ASR/provider acceptance |

The required local real-ASR gate is **not complete**. Removing unaccepted
provisional documents preserves the rule that a flake is worse than no golden.
The strict default supplied-model path retains the CPU prerequisite and cannot
be reported green merely because `--transcription-contract-only` passes.

## Pre-acceptance failures and corrections

1. The first exploratory settings request guessed an unsupported
   `transcriptionSpeakerCount` field. The public API rejected it. Subsequent calls
   use explicit per-action speaker counts where supported.
2. An early export inherited the loopback scenario's temporary download alias
   after it had been removed, recreating a directory under the worktree. The
   later scenario pins its own physical run-local output directory; the original
   generated export is preserved in scratch and its exact owned directory removed.
3. The CPU assertion rejected `exploration/suite-WWLnaJ`, as described above.
   No provider normalization or application fix was made.
4. An initial missing-source experiment removed the file before public admission,
   so admission rejected it rather than creating the desired executor failure.
   The corrected scenario admits first while queued, then renames the source.
5. A draft automatic-silence run timed out before seeing the expected child amid
   an output-path mismatch and the stale-child wait defect. It is excluded from
   acceptance; the corrected scenario pins its own output settings and exact task.
6. Earlier exploratory rediarization polling consumed the oldest completed child
   from `list_tasks`. The corrected wait follows the exact task ID exposed by
   `get_transcript` and waits for that task. All provisional ASR documents from
   the earlier harness were removed; none are accepted recording evidence.

## Independent harness review

A separate read-only GPT-6.1-Sol/medium reviewer checked the new files, shared
registrations, old-golden isolation, manifest verification, output ownership and
proof integrity. It found no blocker in the two model-management cases.

- A strict success scenario could previously record an unexpected failed terminal
  task without reaching its CPU assertion. The helper now checks expected status
  before provider validation/recording: success requires completed, missing-source
  requires failed, and active cancel requires cancelled. Installed-model ensure
  separately requires completed.
- Evidence-write failure could previously bypass stream/server cleanup. Nested
  finalizers now close the SSE stream and loopback server even if evidence writing
  or the other close fails. Loopback startup failure also closes the open SSE
  stream.

The reviewer independently rechecked both remediations and reported zero
unresolved findings in this scope. It did not independently rerun the packaged
repeat sequence. The guards/cleanup refinements do not change accepted golden
outputs; every already-retained successful model task has the completed status
now required by the guard.

## For OWNER-REVIEW

- The baseline provider-fallback detector misses the native addon spelling
  “Fallback to cpu!”, making the required app-reported CPU baseline unstable.
  This lane records the defect and does not repair application source.
- The selected transcript source view was ASR before restart and latest German
  captions after reopening the same physical profile. Preserve this observed
  baseline behavior until a separate product change is authorized.
- Spoken sample redistribution provenance remains unestablished, so bytes stay
  in the external supplied model tree.
- No application behavior is changed by this lane. Final uncovered scenarios
  will be enumerated here and in the scratch `HANDOFF.md`.

## Repository gates

Under pinned Node `v22.23.4`, `bun run check`, `bun run test`,
`bun run deps:check` and `bun run port:check` all exited 0 during implementation.
The ratchet reported 12 ported configurations and zero violations. Test receipts
include 13 successful Turbo tasks, four script tests and 78 final focused tests.
The first check attempt found import ordering in the new manifest verifier;
that error was corrected without changing diagnostics. A later focused harness
lint pass found 20 formatting/style errors in draft new files and registration
lines; only those new files and changed lines were fixed. Final checks are green. The pre-existing renderer
hook dependency warning remains. The dedicated new loopback server tests also pass four of four with
`bunx --bun vitest run apps/desktop/scripts/port/golden/transcription.test.mjs`.
The final `bun run check` after harness formatting and the added server tests
also exited 0.

No new packaged build is required: the assignment records against the supplied
read-only pre-port build. Hosted CI and comparison against the future transcription
port remain outside this lane's proof.

## Additional proof limits

The successful explorations do not constitute twenty-run inference determinism.
Pause/checkpoint restoration and a transcript edit on the newly recognized media
were not separately exercised. The existing original suite retains its edit
coverage. Caption cue labels do not establish named-speaker parsing or AI-tagged
source classification. The fixture builder and server support the public media
scenarios; injected model-installer raw/checksum/archive/member and slow/truncated
transport fixtures belong to the separate package characterization suite and
were not added here. There is no packaged public catalog-URL override that would
turn fake model files into real model-loading proof.

No source bug was repaired, no model was downloaded, no existing golden was
updated, no CLI bundle was rebuilt, and no commit, push or PR was made. Legacy
facade exports and their consumers are unchanged; this is a golden lane, not the
transcription package port. The designated orchestrator retains package-port,
publication, hosted CI and eventual acceptance responsibility.
