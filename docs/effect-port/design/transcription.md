# Design: `@vidbee/transcription` (phase 6c)

Status: reviewed, findings resolved (section 13)

Inputs: `PLAN.md` sections 3–7 and Amendments; `PORT-GUIDE.md`; `tsconfig.base.json`; the reviewed db and task-queue designs and the phase 4 packages; the reviewed downloader-core design; the source inventory; the independent review; package source and consumers on `main` at `79f556b`; installed Effect 4.1.4, `@effect/platform-node` 4.1.4 and sherpa-onnx-node 2.0.1; `GOLDENS.md` and `reports/4-loopback.md`.

This is a read-only design revision. No implementation, full test execution, packaged launch or verification gate is claimed.

Paths below are repository-relative. **T** means `packages/transcription/src/`; **M** means `apps/desktop/src/main/lib/`. Line numbers identify existing source, not proposed companions.

## Amendments after the code reviews (2026-11-18)

This design was drafted and reviewed against `main` at `79f556b`. Before its implementation
started, the earlier ports were code-reviewed and fixed (`reports/review-fixes.md`) and the
downloader port merged (`reports/5.md`). Where the text below disagrees with this section, this
section wins; the characterization step re-checks every statement about current behavior against
the tree it runs on and corrects the design where the source has moved.

- `PORT-GUIDE.md`, "Defect classes found by code review" and "Parity boundary for inputs outside
  the declared types", are binding: exact parity inside declared types; outside them parity only
  where the old code returned a result for `null`, a JSON scalar of the wrong kind or `NaN`; no
  emulation of engine error text. Wherever this design asks for an old engine `TypeError` to be
  reproduced for a type-violating call, that requirement is dropped unless the value is external
  data the package itself reads and the item is listed in section 9 or 11.
- The port keeps three differential oracles as permanent tests, built before parity is claimed:
  pure functions, strict schemas against the zod schemas they replace (acceptance and decoded
  value), and the stateful entry points driven side by side with the old classes
  (`PLAN.md`, Amendments of 2026-11-18).
- The implementation is code-reviewed by independent sessions before its pull request.
- The shared process contract this design extends is the one merged with phase 5
  (`packages/downloader-core/src/DownloadProcess.service.ts`, `Process.model.ts`,
  `ProcessRequests`); two phase 6 units extend it in parallel (browser capture and this one):
  keep each extension additive and in its own declarations so the branches merge.

## 1. What the package is, and what makes its port risky

Local speech recognition and speaker diarization, model installation, audio extraction, caption import, transcript persistence and editing, resumable worker execution, cloud clip checkpointing and automatic transcription after download completion. The current package has seven export entries and no package-local automated test suite.

Five properties decide the design:

1. **Much of the public API is synchronous.** SQL and memory stores, model status and deletion, sidecar scanning and import, partial-buffer operations and runtime path resolution return synchronously. Desktop calls sidecar import while building synchronous snapshots (`T/import-captions.ts:143`; `M/transcript-host.ts:225`). Making those methods Promise-returning breaks A6.
2. **Production recognition runs in another process.** Native decode, VAD, diarization and embedding calls block that process’s event loop. The parent supplies an unref’d heartbeat because the worker cannot reliably run its own heartbeat during inference (`T/executor.ts:728–741`; `T/worker/entry.ts:164–166`). Replacing synchronous native calls with sherpa’s asynchronous APIs changes this behavior.
3. **Callbacks are synchronous protocols.** Model listeners can throw or re-enter the manager. Executor progress updates partial state, persists stage changes, calls the host stage hook, then sends queue progress and stdout events (`T/executor.ts:240–284`). A stream or mailbox cannot replace that sequence.
4. **Persistence is broader than SQLite.** `chunks.json`, `stages.json`, seed transcripts, worker results, runtime probe caches, model archives and `cloud.json` have different acceptance, publication and cleanup rules. Cloud request IDs are persisted before upload to preserve paid-result replay.
5. **Failure and cancellation policies differ by site.** Worker completion waits for termination; caption extraction times out after requesting TERM without waiting; audio probes have no deadline; model HEAD failure usually means unknown length. These policies stay distinct.

The standing directive is applied: schemas first, then service contracts, then implementations; strict ported package and temporary unported sibling; unchanged legacy signatures, synchronous results, failure timing, error classes and messages. Apparent bugs are recorded in section 11.

Two constraints cannot be represented faithfully by the stock native services alone: raw Node process observations and blocking worker stdout. The application retains compatibility implementations in this phase. Native implementations have explicit behavior and cutover obligations; they do not claim observations the installed APIs cannot supply.

## 2. Shape of the port

- **`packages/transcription`**, ported: schemas, tagged errors, services, implementations and unchanged synchronous functions that satisfy the rules.
- **`packages/transcription-legacy`**, unported and temporary: old classes, Promise APIs, callback adapters, synchronous host capabilities and worker composition over the new implementation. It shrinks as consumers move and is deleted in phase 10.

Dependencies point from compatibility to ported code. Ported transcription imports the strict task-queue package, db contracts and strict i18n contracts where needed; it never imports `task-queue-legacy`, `i18n/legacy` or its own sibling.

Existing filenames stay. New companions follow D21: `Transcript.model.ts`, `Worker.model.ts`, `Model.model.ts`, `Transcription.errors.ts`, `TranscriptStore.service.ts`, `TranscriptStore.layer.ts`, `Sherpa.driver.ts`, and equivalent service/layer files.

### Export entries

**P** means unchanged synchronous values and structural types. **L** means the old host-dependent or Promise/callback API. Counts are distinct external files changing an import at that entry; rows overlap.

| Existing entry | Ported package | Compatibility package | Production files changing imports |
| --- | --- | --- | ---: |
| `.` | P symbols listed below; domain types; Effect services and layers | Old store, manager, executor, coordinator and pipeline classes; host-dependent helpers; callback and Promise operations | 8 |
| `./asr` | All existing tier/speaker-count constants, types, guards, parsers and selectors | No wrapper needed | 0 |
| `./concurrency` | Constants, clamp and `canAdmitTranscription`; Effect concurrency operation | `applyTranscriptionConcurrency` and its Promise-or-void queue interface | 0 |
| `./cloud` | All existing constants, types and `parseTranscriptionProvider` | No wrapper needed | 0 |
| `./cloud-runner` | `cloudClipWav`; cloud models and Effect runner | `runCloudTranscription`, old callback input and Promise cleanup | 1 |
| `./download-mirrors` | Constants, types, guards, parsers and URL calculations; Effect mirror/HTTP services | `preferChinaMirrors`, `fetchFirstOk`, `createGithubMirrorFetch` | 3 |
| `./worker` | Native worker entrypoint; no exported values | Compatibility worker entrypoint; no exported values | 0 |

The worker build input changes separately; it is not a source-import count.

**Ten distinct production files change imports**, all under desktop:

- `M/agent-transcript.ts`, `M/agent-run-context.ts`: sidecar scanning.
- `M/transcript-host.ts`: stateful classes, sidecar/import operations, partial singleton, host profile, minimal fill and native-Map grouping.
- `M/task-queue-host.ts`: executor, migration, concurrency application and runtime discovery.
- `M/local-speech-runtime.ts`: manager/options and worker environment.
- `M/cloud-transcription.ts`: executor options and cloud runner.
- `M/import-local-media.ts`: enqueue and store type.
- `M/asr-model-executor.ts`: legacy `ModelManager` type.
- `M/ytdlp-kernel-host.ts`: mirror fetch/preference.
- `M/local-speech-catalog.ts`: `fetchFirstOk`.

Mixed imports split. Unchanged pure values and domain types keep their original specifier.

**One additional test file changes imports:** `apps/desktop/test/transcription-lifecycle.test.ts`, whose direct source imports currently reach coordinator, memory store, runtime probe, termination, executor and options. Its six cases remain covered with the same assertions.

The search finds 31 production source/type consumer files, plus desktop bundler configuration and that test file. Renderer consumers use `./asr`, `./cloud`, `./concurrency` and domain types; their imports remain. `packages/ui` has a descriptive transcription string, not a transcription import. `apps/extension` and CLI have no direct package import. Desktop’s shared extension-caption parser imports `parseAssCues` and `parseCaptionCues`; those stay.

### Root export disposition

This table covers the root barrel’s value groups (`T/index.ts:1–339`). Constants and domain types stay unless a row explicitly identifies an incompatible representation.

| Source/export group | Disposition |
| --- | --- |
| `asr-tiers`, speaker-count, speaker-embed constants and `embeddingIdForLanguage` | P. Preserve tier ordering, retired-tier coercion, error text and ignored language argument. |
| `asr-recognizer`: language predicates/no-op, `QWEN3_LANGUAGE_NAMES`, config construction | P where supplied paths are the complete input. `resolveAsrModelPaths` and `tryRecognizerConfig` use model services; old manager-taking forms are L. Native `Set` language-code exports have strict HashSet forms and legacy native-Set forms. |
| `asr-recommend`: classifiers, GPU extraction/name functions, recommendations | P except `isAppleSilicon`, `resolveGpuProfile`, `readMachineProfile`, whose defaults read the host. |
| `asr-words`, `isReusableExtractedWav`, sample-rate constant | P. `extractMonoWav` and `readPcmWav` are service operations; old forms are L. |
| Caption text parsing, tag/language calculations, cue conversion and selection | P except the path-sensitive symbols below and sidecar scanning. Keep `isHumanCaptionTrack === isImportableCaptionTrack`. |
| Chinese script detection/conversion | Unchanged synchronous exports over one OpenCC driver service implementation; no runtime per conversion. See section 5. |
| Chunk manifest | `manifestWorkKey` stays synchronous with identical hashing. File fingerprint/load/ensure/append operations become effects; old forms are L. |
| Compute provider | Fallback-log predicate/constants are P. Candidate defaults require host information; selection is effectful. Old forms are L. |
| Concurrency | Constants/clamp/admission predicate are P. Queue mutation is effectful; old fire-and-forget function is L. |
| Coordinator, enqueue, executor | Effect services; old class/functions and option types are L. |
| Error classifiers and `NO_AUDIO_STREAM_ERROR` | P, importing strict task-queue models/helpers. Classification remains data, not an exception. |
| Caption extraction/import | Effect services; old synchronous and Promise forms are L. |
| Minimal fill, memory store, SQL store, migration, model manager | Effect services; old APIs are L. DDL/query constants remain P. |
| Model catalog/progress | P; move catalog-only tokenizer constants away from file-probing implementation dependencies. |
| Native environment/runtime | Effect host/runtime operations; old defaults and synchronous forms are L. `isElectronBinary` and `formatRuntimeLog` are P. |
| Partial singleton | Effect state service; L exposes the existing synchronous singleton object. |
| Fake/sherpa pipelines | Effect pipeline layers; old constructors and Promise `run` are L. |
| Punctuation algorithms | P over supplied `Punctuator`; sherpa punctuator acquisition belongs to the sherpa driver. |
| Speaker assignment/refinement/chunk calculations | P except file operations, store-taking seed readers and native-Map signatures. |
| `foldShortClusters`, `capExcessClusters`, `clusterSpeakerEmbeddings`, `groupTranscriptHeads` | Strict versions use Effect collections and explicit order; L preserves native `Map` arguments/results and identity behavior. |
| Transcript editing and source selection | P, including mutable results, stable ordering and retained object references. `groupTranscriptHeads` is the exception above. Strict store-read helpers additionally accept the wider stored read models in section 3; old callers retain their declared forms. |

### Host-capability audit

| Symbol and current location | Hidden capability | Strict disposition and legacy behavior |
| --- | --- | --- |
| `isAppleSilicon`, `T/asr-recommend.ts:180`; `resolveGpuProfile`, `:232`; `readMachineProfile`, `:267` | Platform/architecture; CPU model, count and RAM | Pure calculations take explicit host data. `TranscriptionHost` supplies it. L preserves optional arguments and live defaults. |
| `sherpaProviderCandidates`, `T/compute-provider.ts:46` | Platform/architecture defaults | Explicit-input calculation plus host service operation; L supplies current defaults. |
| `preferChinaMirrors`, `T/download-mirrors.ts:74` | Live environment, locale, timezone and i18n detection | Mirror-preference service. L preserves environment-before-setting precedence and calls existing locale detection. |
| `isMachineCaptionPath`, `T/captions.ts:81`; `languageFromSidecarName`, `:402` | Host `basename`/`extname` rules | Explicit path calculation internally; L retains old host-sensitive signature. Consequently `isImportableCaptionTrack`, its alias and `pickCaptionTrack` retain synchronous compatibility wrappers where a path is supplied. |
| `findSidecarCaptionTracks`, `T/captions.ts:423` | Existence, directory enumeration, stat, UTF-8 reads, path operations | Caption-files operation; L is synchronous, preserving enumeration order and per-file catches. |
| `ffprobePathFromFfmpeg`, `T/extract-captions.ts:29` | Host dirname/join | Path service; L preserves synchronous path semantics, including case-sensitive `endsWith('ffmpeg.exe')`. |
| `modelPartPath`, `T/model-manager.ts:80` | PID | Explicit PID calculation; L reads current PID. |
| `sourceFingerprint`, `T/chunk-manifest.ts:41` | Stat | Files service; exact `${size}:${Math.round(mtimeMs)}`. |
| `manifestWorkKey`, `T/chunk-manifest.ts:46` | Node crypto implementation, but no host-dependent input | Pure synchronous SHA-256, exact NUL-separated UTF-8 input, lowercase hex, first 24 characters. |
| `nodeBinaryName`, `T/runtime.ts:52` | Default platform | Explicit-platform calculation; old optional default is L. |
| `probeCacheKey`, `T/runtime.ts:73`; bundled/worker path resolvers, `:103,174,246` | Stat, path, temp/cwd/resources paths, environment, executable probes | Runtime/host services; old synchronous defaults and discovery order are L. |
| `resolveSherpaLibraryDir`, `sherpaWorkerEnv`, `T/native-env.ts:27,46` | Module resolution, filesystem, platform and environment | Host service. L preserves fresh environment merge and platform library-path prepend. |
| `latestAsrSeed`, `latestTranscriptSeed`, `T/speaker-assign.ts:163,213` | Supplied store methods | Effect store operations; L accepts the existing structural synchronous store interfaces. |
| `transcriptionPartials.setStage`, `T/partial-buffer.ts:66` | Clock | Partial service obtains time at the old position; L supplies synchronous wall clock. |
| `applyTranscriptionConcurrency`, `T/concurrency.ts:59` | Supplied queue mutations | Effect command operation; L launches the same three methods synchronously and ignores their returned Promises. |

A path-looking string is not automatically a portable basename. Node-oracle tests decide host path semantics; replacing backslashes globally would change POSIX behavior.

## 3. Schemas

Models precede services. Existing type files keep their names and re-export schema-derived aliases.

### Domain models

| Companion | Schemas |
| --- | --- |
| `Transcript.model.ts` | `TranscriptWord`, `TranscriptSpeaker`, `TranscriptSegment`, `TranscriptRecord`, `TranscriptHead`, `StoredTranscriptRecord`, `StoredTranscriptHead`, `TranscriptPlaybackCue`, summary/source shapes, segment patch and insertion input |
| `Pipeline.model.ts` | Pipeline speaker/segment/result/progress, seed, timed turns, intervals and waveform metadata |
| `Model.model.ts` | Model specification, directory members, file/tier/download/status/preparation shapes and assessments |
| `Worker.model.ts` | Start/probe/cancel messages; progress/partial/result/error/log/probe-ok messages; runtime and provider observations |
| `Checkpoint.model.ts` | Chunk manifest, chunks/turns, stage history, JSON-unknown runtime probe-cache root, cloud progress and saved clips |
| `Cloud.model.ts` | Existing cloud catalog/model/result types and provider kit |
| `Host.model.ts` | Environment, machine/profile and process-command data; no Node namespace types |

Use `LiteralKit` for existing string unions: 13 ASR tiers, five families, language groups, machine/OS/GPU kinds, four execution providers, transcription trigger/stage/backend, source kind, produced result kind, model role/group, worker runtime layer, caption format and protocol discriminants. Speaker count retains its current `'auto' | 1…8` shape. Stage-history `stage` remains `string`, distinct from live progress’s stage kit.

Public data uses structs, not classes. Mutable fields use `S.mutableKey`; mutable arrays use `S.mutable(S.Array(...))`, recursively. Preserve readonly catalog arrays and shallow readonly views where declared. Optional fields admit explicit `undefined` through `S.optional`. Check old/new mutual assignability in the sibling’s original optional-property mode, including nested mutation.

All modeled numbers are `S.Finite`. Do not add integer, positive, bounded-percent, ordered-time, confidence-range, speaker-existence or catalog-price refinements unless the present reader enforces them. Editing keeps its existing finite/round/clamp calculations (`T/transcript-edit.ts:28–39`).

### Produced result kinds and stored result kinds

`TranscriptResultKind` remains the existing `'transcript' | 'no-speech'` kit for produced pipeline results and the old public declarations. Stored reads have a separate, wider model.

`packages/db/src/Transcripts.model.ts:6–24` defines `TranscriptRow.resultKind` as `S.String`. Today full hydration copies `row.result_kind` unchanged (`T/transcript-store.ts:615–632`), and head mapping does the same (`T/transcript-store.ts:101–114`). A stored `"future-kind"` is readable through both paths. The port preserves that string; it does not normalize or reject it.

The schema declarations are:

```ts
export const StoredTranscriptRecord = S.Struct({
  ...TranscriptRecord.fields,
  resultKind: S.mutableKey(S.String)
})
export type StoredTranscriptRecord = typeof StoredTranscriptRecord.Type

export const StoredTranscriptHead = S.Struct({
  ...TranscriptHead.fields,
  resultKind: S.mutableKey(S.String)
})
export type StoredTranscriptHead = typeof StoredTranscriptHead.Type
```

`TranscriptRecord` and `TranscriptHead` above retain their existing declared result-kind field. The strict store returns `StoredTranscriptRecord` and `StoredTranscriptHead`. Read-side source, summary, grouping and seed calculations accept these wider records and keep their existing literal comparisons. A future result kind therefore remains readable and continues to fail predicates that specifically require `'transcript'`, as today.

The compatibility store keeps the old public return declarations. Its existing unchecked declaration of stored `result_kind` is confined to the unported facade boundary; it does not become a literal decoder or a type assertion inside strict code. Mutual-assignability fixtures cover the legacy declarations separately from the honest strict read models. No strict consumer treats `StoredTranscriptRecord` as a produced `PipelineResult`.

This follows the db precedent: db models describe storage, and the owning package decides semantic narrowing. Here the owning package deliberately retains the storage string for reads. There is no additional result-kind rejection in section 9.

### Boundary acceptance and recovery

Decoding is reader-specific. A semantic domain schema is not a substitute for today’s tolerant disk-reader algorithm.

| Boundary | Current behavior | Codec and recovery |
| --- | --- | --- |
| SQL transcript/head/speaker/segment rows, `T/transcript-store.ts:155–290,580–632` | Cast rows; normalize absent `asrTier` to null and any non-`captions` source kind to `asr`; return stored result-kind strings unchanged | Decode db row models or query-shaped field projections, then existing normalization into the stored read models. New structural/non-finite rejection is section 9. Do not newly reject arbitrary stored `source_kind` or `result_kind` strings. |
| `words_json`, `T/transcript-store.ts:116–142` | Missing, invalid JSON or non-array → `[]`; omit elements lacking string text and numeric times; project only three fields | JSON-unknown decoder, array recognition and per-element word decoder. Keep omission and projection. Non-finite numeric elements are section 9. |
| `chunks.json`, `T/chunk-manifest.ts:84–106` | Missing/read/syntax failure or falsey key components → null; missing arrays default; nested content otherwise cast | Open persisted envelope with existing key/default normalization; decode consumed chunks/turns at use. Preserve unknown fields through load/append/save. Structurally unusable consumed values are section 9. |
| `stages.json`, `T/chunk-manifest.ts:165–187` | Missing/bad JSON/non-array → null; filter elements by string stage/numeric timestamp; retain accepted objects | Open per-item codec, finite timestamp; keep null/filter recovery. Do not narrow stage strings. |
| Seed transcript, `T/speaker-assign.ts:269–294` | Bad/missing file or empty/non-array segments → null; normalize several fields; accept speakers/segments without nested validation | Normalize that envelope first; decode consumed elements. Return object retains only today’s returned root fields, while retained nested objects remain open. |
| Worker JSON lines, `T/worker/protocol.ts:202–210` | Blank/invalid JSON → null; valid JSON of any shape passes; handlers ignore unrecognized kinds | Decode JSON to unknown, then branch-specific schemas. Unknown kinds remain ignored. Known malformed messages use section 9’s explicit policy. Preserve parent streaming UTF-8 and newline carry; no new final-line flush. |
| Inline/file worker result, `T/worker/protocol.ts:188–199` | Truthy inline result wins; absolute/relative paths accepted; missing file throws; JSON cast | Preserve precedence and path resolution. Decode pipeline result before commit; no containment restriction. New semantic rejection is section 9. |
| sherpa ASR result, `T/asr-json.ts:69–118` | Native wrapper parses JSON; retry only the recognized raw-control-character syntax failure | One sherpa driver owns result reading and schema decoding. Compatibility retains the synchronous patch/restoration. Native alternative is section 12. |
| sherpa VAD/diarization/embedding outputs, `T/pipeline-sherpa.ts:156,369–416,494–612` | Array or size/get turns; absent optional VAD fields default; absent/unready embedding means none | Normalize supported native forms inside driver, decode observed fields, retain optional/default and embedding-skip paths. No new clustering refinement. |
| Caption files/process text, `T/captions.ts:299–389,423–473` | UTF-8 text; malformed cues/ASS rows skipped; BOM stripped by caption parser | Byte-to-text contract in section 6, text schema and existing parser. Do not reject the whole document for a bad cue. |
| ffprobe subtitle JSON, `T/extract-captions.ts:94–164` | Process/JSON failure → `[]`; later wrong-shaped `streams` can throw; individual extraction errors skip tracks | JSON-unknown envelope followed by existing normalization/filtering. Preserve traversal failures in compatibility; do not turn all wrong shapes into empty success. |
| Audio duration/audio-stream output, `T/audio.ts:198–256` | `parseFloat` with finite check → rounded milliseconds or zero; trimmed nonempty stdout means audio; process errors → zero/true | Decode text, retain those calculations. No stricter numeric-text or CSV grammar. |
| WAV, `T/audio.ts:267–325`; cloud PCM, `T/cloud-runner.ts:91–126` | Different parsers: general reader averages channels and supports 8/16/32-bit; cloud requires mono 16-kHz PCM16 with chunk bounds | Separate byte schemas/parsers. Preserve first-data-chunk selection, padding, general-reader defaults, truncation and Node range errors. Do not impose cloud constraints on general audio. |
| Publisher checksum manifest, `T/model-manager.ts:744–766` | Verify manifest’s pinned hash first; JSON parse; find matching basename and lowercase 64-hex digest | Broad JSON envelope and existing field checks. Keep unrelated entries permissive. |
| Directory member JSON, `T/qwen3-tokenizer.ts:112–147` | Require non-null non-array object, minimum size and exact hash | Schema for that object acceptance only; do not validate tokenizer semantics. |
| Runtime probe cache, `T/runtime.ts:84–100` | Read/JSON errors → `{}`; any valid JSON root survives loading; unchecked property lookup and object spread happen afterward | `S.fromJsonString(S.Unknown)` followed by the exact lookup/spread semantics below. No record-root or boolean-value decoder and no new root-shape recovery. |
| `cloud.json`, `T/cloud-runner.ts:140–153,174–208` | ENOENT initializes; other I/O/syntax failures propagate; check account and clip boundaries; reuse saved results | Open persisted codecs at every rewritten object level. Keep account/boundary checks and request-ID order. Decode consumed saved results; section 9 covers newly unusable shapes. |
| Injected cloud callback result | Host validates selected fields, not every declared field (`M/cloud-transcription.ts:98–121`) | Treat the callback as a typed host operation; do not add validation at call entry. Disk replay is separately decoded. |

Use `S.fromJsonString`, `S.decodeUnknownEffect`, and pure `S.decodeUnknownResult`/`S.decodeUnknownOption` where appropriate. No throwing Schema synchronous decoder in strict code.

Open persisted objects use `S.StructWithRest` with an unknown-valued record at every retained object level. Effect 4.1.4 has no preserve-excess-properties parse option. Conversely, words, seed root normalization and other existing projections keep their present field removal.

The runtime probe cache is a separate JSON-unknown boundary. At `T/runtime.ts:87–92`, only file reading and JSON parsing are inside the loader’s catch. `get` performs `load()[key]` afterward at `:95`. Arrays, strings, numbers and booleans therefore support ordinary JavaScript property lookup; an absent key yields `undefined`, and inherited or boxed properties remain observable. A `null` root throws `TypeError` from `get`, outside the loader’s catch. `set` at `:96–98` spreads the loaded root and adds the supplied key: arrays contribute enumerable indices, strings contribute enumerable characters, numbers/booleans/null contribute no own enumerable properties, and object keys are retained. A failed read or syntax error alone supplies `{}`.

The compatibility root-access capability retains those operations and the native TypeError boundary. The strict reader decodes JSON to unknown, applies the equivalent property-access and spread rules, and carries traversal failure through `HostFailure`; it does not reset a valid non-record root. Unknown cache values retain their truthiness and identity behavior at the existing selection branches.

Write serialization remains distinct from semantic read validation. Schema JSON-unknown encoding preserves current JSON serialization, key order, omission and non-finite-to-null behavior; it does not validate trusted in-process inputs before writing.

There is no zod import or package-owned zod schema in transcription. Nothing moves to the sibling on that account. Desktop’s zod schemas remain with desktop.

## 4. Errors

Native failures are schema-backed tagged errors in `Transcription.errors.ts`: `SourceUnavailable`, `AudioFailure`, `ModelUnavailable`, `ModelBusy`, `ModelIntegrityFailure`, `RuntimeUnavailable`, `WorkerUnexpectedExit`, `WorkerFailure`, `CheckpointFailure`, `TranscriptUnavailable`, `BoundaryDecodeError`, and `HostFailure`.

Each applicable error carries operation, exact `legacyMessage` and original cause. `HostFailure` retains the original thrown value with `S.Defect()`. SQL remains `SqlError`/`DbRowDecodeError`, not a competing database abstraction. Tagged classes use the installed branded schema-class form.

Compatibility uses the shared synchronous/Promise cause mappers. It unwraps original host/driver failures by identity, reconstructs only package-created errors, and never leaks a `FiberFailure`. Synchronous methods throw synchronously; `async` methods reject even when their failure occurs before their first await.

| Observable origin | Compatibility contract |
| --- | --- |
| Tier/config errors, `T/asr-tiers.ts:304–309`; `T/asr-recognizer.ts:171–291` | Ordinary Error: `unknown asr tier: ${id}`, `unknown asr family: ${family}`, `model missing: whisper`, `qwen3-asr`, `fire-red-asr`, `sense-voice`, `parakeet`, or the incomplete-model issue. `tryRecognizerConfig` catches and returns null. |
| Source/audio, `T/audio.ts:42–90,145,183–186,270–322` | Exact source/ffmpeg missing, empty WAV, empty-after-remux, truncation, no-audio, non-WAV, missing-data and unsupported-depth messages. Nonzero conversion retains nullable code and last 2,000 stderr characters. |
| Native loading/pipeline, `T/pipeline-sherpa.ts:145–150,179,373,409,517,552,679` | Exact addon-unavailable prefix plus original message; `cancelled`; `model missing: silero vad`; `model missing: speaker diarization`. Optional punctuation acquisition failures remain swallowed. |
| Model lifecycle, `T/model-manager.ts:208,490,528–531,676–718` | Archive-lock timeout, not-ready, busy-delete, unknown-tier, no-URL and did-not-produce messages unchanged. |
| Model integrity, `T/model-manager.ts:750–763,850,979,1025,1128,1177`; `T/qwen3-tokenizer.ts:50–153` | Exact checksum-manifest, missing-SHA, checksum-mismatch, network and `incomplete model` messages, including repair hint punctuation. |
| Model cancellation, `T/model-manager.ts:299–312` | Error named `AbortError`, message `download cancelled` with optional `: ${tier}`. `ensureReadyAllowCancel` returns status on recognized cancellation. |
| Mirror errors, `T/download-mirrors.ts:162–191,229–234` | `no download URLs`; `download failed for ${url} (${status})`; Error named `TimeoutError` with `download timed out: ${url}`. Error-valued abort reason is thrown by identity; other reasons become Error named `AbortError`, message `download cancelled`. Final non-Error failure is stringified at the existing point. |
| Runtime/executor, `T/runtime.ts:202,240`; `T/executor.ts:228,306` | `no usable transcription worker runtime`; `source file missing: transcription options incomplete`; `Cloud transcription is unavailable in this application`. |
| Runtime probe-cache traversal, `T/runtime.ts:95` | A valid JSON `null` root still throws TypeError from property lookup. Do not map it to an empty cache or a new boundary-decode error. |
| Worker exit, `T/executor.ts:852–873` | Internal `WorkerExitError` behavior retained: code/signal fields; `ai-worker exited without result (code ${code}${signal ? ', signal '+signal : ''})`, then trimmed last 800 stderr characters when present. Public executor exposes classified finish data and nullable exit code. |
| Protocol/result, `T/worker/protocol.ts:175,197`; `T/chunk-manifest.ts:121,210` | Exact stdout-write, missing-result and missing-manifest messages. Worker `"error"` becomes an ordinary Error with the supplied message; `"cancelled"` and abort retain cancellation precedence. |
| Atomic files, `T/atomic-file.ts:23–75` | `cancelled: work dir missing (${dir})`; otherwise original filesystem failure, including cleanup failures that currently replace an earlier error. |
| Caption capture, `T/extract-captions.ts:50–70` | `${bin} timed out after ${timeoutMs}ms`; `${bin} failed (exit ${code}): ${stderr.slice(-500)}`. Timeout caller completion does not wait for reaping. Preserve caller catches into empty results or skipped tracks. |
| Store, `T/transcript-store.ts:383,395,414`; `T/memory-store.ts:89` | `transcript commit failed for ${id}`; `Caption transcript is unavailable`; `Caption transcript could not be read after appending cues`. Missing lookup/edit/activation remains null rather than a new error. |
| Cloud, `T/cloud-runner.ts:98–126,153,175,180,214` | Exact four PCM errors, account mismatch, changed audio, checkpoint mismatch and missing clip-result errors. Abort uses original signal reason. Callback failures retain `code`, `status`, `retryAfterMs` and identity. |
| Filesystem, process, SQL, OpenCC and injected callbacks | Original Error/TypeError/RangeError/SyntaxError or non-Error value where currently propagated. SQL uses `rethrowDriverError`; callback exceptions retain their original escape/catch/rejection position. |
| Existing JSON syntax failures that propagate | Compatibility replays the same Node JSON parsing at the failure boundary to recover native SyntaxError class/message. Tolerant readers retain their null/empty recovery. |
| Newly rejected boundary shapes | Section 9; never disguised as an existing native error. |

`classifyTranscriptionFailure` remains the ordered classifier at `T/errors.ts:30–78`: HTTP 429 first; cloud reservation codes; disk/permission; missing FFmpeg; no audio; FFmpeg; missing source; network; sherpa/model/native; unknown. Preserve the 120-second cap/default five-second 429 delay and nonretryable no-audio result.

## 5. Services

All services use `Context.Service` classes and deterministic package/file/service keys. Implementations live in layers/drivers. In this table, `E<A>` means `Effect.Effect<A, TranscriptionError>`; SQL operations additionally expose `SqlError | DbRowDecodeError`. Layer requirements are explicit in implementation signatures.

| Service | Contract with Effect signatures | Native layer | What compatibility provides instead |
| --- | --- | --- | --- |
| `TranscriptionHost` | `snapshot: E<HostSnapshot>`; `workerEnvironment(extra, electronAsNode): E<Environment>`; `machine(options): E<MachineProfile>`; `libraryDirectory: E<string \| null>`; `lowerPriority(pid): E<void>`; `isProcessAlive(pid): E<boolean>` | Config, platform/path capabilities and explicit host primitives supplied at composition | Live Node environment/OS/module resolution, existing priority helper and PID-zero probe; synchronous where reached by sync APIs |
| `TranscriptionFiles` | `readBytes/readText/stat/readDirectory/exists/write/mkdir/rename/remove/openRead` as effects; primitive flags and positional reads retained | `FileSystem`, `Path`, explicit UTF-8 and byte parsers | Sync Node operations on synchronous paths; Promise operations at current async positions; original errors |
| `TranscriptionTime` | `now: Effect<number>`; `monotonicMillis: Effect<number>`; synchronous `readMonotonicMillis(): number` for one native measurement stretch; `sleep(ms): Effect<void>`; `after/every(ms, action, {keepAlive}): Effect<Cancel>`; `microtask(action): Effect<void>` | Clock and owned fibers; monotonic reads from the captured Clock; host timer primitive when reference semantics matter | Date/performance, timeout/interval/microtask and injected minimal-fill scheduler; synchronous performance reads inside probe decode |
| `TranscriptionIds` | `uuid: Effect<string>`; `hex(bytes): Effect<string>` | `effect/crypto/SecureRandom` service | Node `randomUUID`/`randomBytes`; exact staging-name widths |
| `MirrorPreference` | `preferChina(input): E<boolean>` | Strict i18n/system-profile and fresh Config inputs | Existing `detectSystemProfile` and live defaults |
| `ModelHttp` | `request(spec): E<ModelResponse>`; response body consumption into a synchronous chunk sink | `effect/http/HttpClient`; explicit status handling and header-only deadline | Exact injected/default fetch invocation, original Response and body seam, no extra request options |
| `ModelFiles` | `assess(spec): E<InstalledFileState>`; `publishFile`, archive-lock acquire/release, staging/marker operations | Files, IDs, time and liveness services; same cache and publication algorithm | Sync host primitives; same process/PID-based names and original failures |
| `Models` | `status/pathFor/pathByRole/pathById/incompleteModelIssue/ensureReady/ensureReadyAllowCancel/redownload/removeTier/cancelDownload/subscribe` as effects | Original manager algorithm, Effect collections and command sink | One warmed manager runtime; old methods and property `modelsDir` |
| `Audio` | `extract(input): E<ExtractedAudio>`; `readPcm(path): E<PcmWave>` | Process and files services; distinct WAV decoders | Old sync `readPcmWav`, Promise extraction and exact spawn semantics |
| `CaptionFiles` / `CaptionImport` | `findSidecars`, `extractEmbedded`, `commitTrack`, `switchLanguage`, `importSidecars`, `importDownload` as effects | Files/process/store services and unchanged calculations; caption process owner below | Existing sync/Promise division and optional extractor callback |
| `TranscriptStore` | Read/list/head/playback/current operations and commit/append/delete/activate/edit/insert as effects; read results use `StoredTranscriptRecord`/`StoredTranscriptHead` | SQL layer on contextual `SqlClient`; separate memory layer | Borrowed handle runtime for SQL; one warmed owner runtime for memory; synchronous old methods and old public declarations |
| `TranscriptMigration` | `merge(input): E<MergeTaskQueueDbResult>` | Contextual target SQL client, scoped source-inspection capability and files | Existing `target`, `openLegacy`, synchronous result and source close/rename behavior |
| `Partials` | `set/setStage/append/getByTask/getByDownload/clear/clearByDownload/restoreFromManifest` as effects | Shared mutable state and time/files services | One module runtime exposing the old singleton; executors and host share it |
| `Sherpa` | Opaque recognizer/VAD/diarizer/embedding/punctuation acquisition and synchronous native-step effects; declarations below | One `Sherpa.driver.ts`, lazy addon loading and schema-decoded observations | Same driver contract with legacy loader/result-reader capabilities and injected addon seam |
| `ChineseConversion` | Pure synchronous `convert(text, script): string`; cached converter acquisition owned by driver | One `OpenCC.driver.ts` service implementation | Same implementation; existing synchronous helper exports remain |
| `Pipeline` | `run(input, sink): E<PipelineResult>` | Sherpa or fake layer; existing algorithms and checkpoints | Old constructors and `run(input): Promise<PipelineResult>` |
| `WorkerRuntime` | `resolve`, `resolvePath`, `probe`, `probeProvider`, probe-cache operations as effects | Host/process/files/time services; JSON-unknown cache access | Exact discovery ladder, sync executable probes and injected probe/cache |
| `TranscriptionProcess` | Additive process acquisition returning `WorkerProcessRun`, with explicit owner and output consumption; declarations in section 6 | Shared phase-5 process implementation and scoped stdin/reaping support | Exact Node pipes, live `child.killed`, writes and child-only termination |
| `CaptionProcessOwner` | `capture(spec, timeoutMs): E<string>`; process scopes belong to the owner rather than the individual capture call | Layer-owned reaping scope; declaration and sequence in section 6 | Existing capture Promise, listeners and immediate timeout rejection; no added compatibility finalizer |
| `TranscriptionExecutor` | Task-queue `TaskExecutor` contract | Executor layer with attempt scopes and command sinks | Callback `Executor` facade in its own warmed runtime |
| `TranscriptionQueue` | Required queue reads/subscription and add/cancel/retry/cap operations as effects | Adapter to strict task-queue service | Structural adapter over the supplied legacy queue; no second queue |
| `AutoTranscription` / `MinimalModelFill` | `start/stop/flushPending` and `startFill: E<{stop: Effect<void>}>` | Original algorithms over queue/model/host/time services | Existing synchronous start/stop, Promise flush and scheduler/logger hooks |
| `LegacyTiming` | `turn(point): Effect<void>` | Existing strict task-queue no-op layer | One microtask turn, shared convention and settlement utility |

### Command-and-sink contracts

```ts
export interface TranscriptionSink {
  readonly emit: (event: TranscriptionObservation) =>
    Effect.Effect<void, HostFailure>
}

export interface ModelStatusSink {
  readonly emit: (status: ModelStatus) =>
    Effect.Effect<void, HostFailure>
}

export interface WorkerOutput {
  readonly send: (message: WorkerOutbound) =>
    Effect.Effect<void, HostFailure>
  readonly flush: Effect.Effect<void, HostFailure>
}
```

`TranscriptionObservation` has progress, partial and log branches. Queue-facing output uses the existing strict `TaskExecutor`/`ExecutorSink` declarations (`packages/task-queue/src/TaskExecutor.service.ts:6–34`), not a new executor protocol.

A sink completes its synchronous prefix before returning. Compatibility listeners enter it through `runLegacySync`. Continuations fork into the owning attempt scope with `Effect.forkIn(..., { startImmediately: true })` at the old launch position. A callback’s throw stops subsequent work exactly where it does today.

Required sequence contracts:

| Protocol | Sequence retained |
| --- | --- |
| Executor `run`, `T/executor.ts:157–213` | Read options and create cancellation state synchronously; queue one microtask; return cancel/pause handles before execution starts. |
| Progress, `T/executor.ts:240–284` | Partial stage update → stage-file write when changed → host stage hook when changed → queue progress → queue stdout. |
| Partial, `T/executor.ts:292–299,778–794` | Update shared partial state → host callback with current segment array. |
| Model listener, `T/model-manager.ts:345–350,1187–1201` | Identity deduplication, registration order, no initial emission, synchronous re-entry and throw propagation. Preserve live Set iteration, removal/re-addition and release removed callback references. |
| Worker result/error, `T/executor.ts:744–849` | Mark settled, clear heartbeat, remove abort listener, request termination and await reaping; only then read/resolve result or reject. Finish once. |
| Coordinator completion, `T/coordinator.ts:50–151` | Enter consideration synchronously from queue subscription; async caption import may overlap; after import recheck running subscription, task completion and stored transcript before enqueue. |
| Concurrency application, `T/concurrency.ts:59–69` | Start global-cap setter, then group-cap setter, then download-cap setter; ignore their Promise results. Do not serialize by awaiting each. |

### Sherpa ownership

```ts
export interface RecognizerSession {
  readonly decode: (wave: PcmWave) =>
    Effect.Effect<AsrRecognizerResult, TranscriptionError>
  readonly probe: (samples: Float32Array) =>
    Effect.Effect<number, TranscriptionError>
}

export interface VadSession {
  readonly accept: (samples: Float32Array) =>
    Effect.Effect<readonly TimeInterval[], TranscriptionError>
  readonly flush: Effect.Effect<readonly TimeInterval[], TranscriptionError>
}

export interface DiarizerSession {
  readonly process: (samples: Float32Array) =>
    Effect.Effect<readonly TimedTurn[], TranscriptionError>
}

export interface EmbeddingSession {
  readonly compute: (wave: PcmWave) =>
    Effect.Effect<Float32Array | null, TranscriptionError>
}
```

The service also creates these sessions from existing configuration models and acquires an optional punctuation operation. Native handles never cross the service boundary. VAD buffering/configuration, optional embedding readiness and `compute(..., false)` remain inside this one driver.

`decode` preserves ordinary recognition at `T/pipeline-sherpa.ts:700–703`: create stream → accept waveform at the supplied sample rate → synchronous `recognizer.decode(stream)` → `readAsrResult`. It does not call `inputFinished`.

`probe` preserves `decodeProbe` at `T/worker/entry.ts:59–67`: create stream → accept waveform at 16,000 Hz → optional `stream.inputFinished()` → first monotonic read → synchronous `recognizer.decode(stream)` → second monotonic read → `readAsrResult` → return the difference in milliseconds. Stream setup, waveform acceptance, `inputFinished`, result parsing, repair and schema decoding are outside the measured interval. Both clock reads are inside the driver, immediately around the decode call. The complete operation is one synchronous native stretch; the measurement is not taken around the returned Effect.

The driver captures `TranscriptionTime.readMonotonicMillis` before entering that stretch. Compatibility supplies `performance.now`; the native implementation can derive milliseconds from the installed Clock service’s `monotonicTimeNanosUnsafe()`. Wall-clock `currentTimeMillis` and `currentTimeNanos` are not elapsed-time substitutes.

Worker probe orchestration stays at `T/worker/entry.ts:133–147`: first usable tier in the current order; benchmark mode runs an unreported 0.2-second warmup, then measures a one-second synthetic clip; ordinary runtime probing measures a 0.3-second clip without that warmup. Each call still reads and validates its result, even though only the measured duration is reported.

Provider selection retains `MAX_ACCELERATOR_DURATION_RATIO = 0.95` and the comparison at `T/compute-provider.ts:134–158`. Accelerator duration greater than or equal to `cpuDuration * 0.95` selects CPU. Setup or result overhead must not enter either duration.

Recognition remains synchronous native decode. No automatic yield is inserted inside an old synchronous native stretch. Compatibility supplies the old `createAddon` seam, including optional constructors. No artificial disposal API is invented: worker exit currently releases native resources.

OpenCC is host-free conversion. Its service shape deliberately has a synchronous pure method; unchanged helpers call the single driver implementation without running an Effect runtime. Lazy converter caching and conversion exceptions remain observable as today.

### Timing, settlement and runtime ownership

Every old await becomes either one host bridge or one named `LegacyTiming.turn`, in the same order. Include awaits on ready/shared work, optional callbacks, lock bodies, already-ready model preparation, worker cleanup and nested async return adoption.

Extract the shared `runLegacyPromise` and `runLegacySync` utilities required by the downloader design into `@vidbee/task-queue-legacy/runtime` if phase 5 has not already done so. On this inspected `main`, settlement is still inline in `packages/task-queue-legacy/src/api/index.ts`; the helper file is absent.

Promise methods settle from `runFork` exit observers, with error mapping there. Do not add a `.then`/`.catch` settlement hop. Preserve `Scheduler.PreventSchedulerYield` in each compatibility runtime.

Each stateful manager, executor, coordinator and memory store has one warmed runtime. Stateful pipeline wrappers retain one owner runtime. Stateless facades share a module runtime. SQL stores use `runtimeForHandle`; they do not create another SQL runtime/connection.

The partial singleton is shared across facade owners. A manager passed into a pipeline retains its original state; the pipeline adapter does not create a replacement manager.

Queue/executor re-entry is explicit:

`queue runtime → legacy executor.run → transcription runtime`, and  
`transcription runtime → legacy queue callback → queue runtime`.

Each runtime remains private. Synchronous callbacks can re-enter either direction. Attempt scopes outlive `run` and close after owned continuations finish. Native caption captures use the separate owner described in section 6 so a timed-out capture does not close its process scope on the caller’s return path.

`stop()` is an operation, not runtime disposal. Coordinator stop unsubscribes and clears pending IDs; minimal-fill stop clears its pending timer but does not cancel an in-flight ensure or suppress its successful callback.

### Confirmed Effect surface

The design uses the installed public leaves: `effect/Context`, `Effect`, `Schema`, `Layer`, `Clock`, `Scheduler`, `Function`, `Scope`, `FileSystem`, `Path`, `Stdio`, `crypto/SecureRandom`, `http/HttpClient`, `http/HttpClientResponse`, `http/FetchHttpClient`, `process/ChildProcess`, `process/ChildProcessSpawner`, and `sql/SqlClient`.

Confirmed source and declaration points include:

- Mutable keys/arrays, open structs and JSON codecs: `node_modules/effect/src/Schema.ts:2538,4204,4919,9881`; corresponding public declarations in `node_modules/effect/dist/Schema.d.ts`.
- Immediate-start scoped forks: `node_modules/effect/src/Effect.ts:18281`.
- Scheduler-yield reference: `node_modules/effect/src/Scheduler.ts:321`.
- Secure UUID/bytes: `node_modules/effect/src/crypto/SecureRandom.ts:49–113`; `uuidV4()` and `randomBytes(size)` are methods on the service.
- Synchronous monotonic clock access: `Clock.monotonicTimeNanosUnsafe()` in `node_modules/effect/dist/Clock.d.ts:50–130`.
- Explicit scope ownership: `Scope.provide`, `Scope.fork` and `Scope.close` in `node_modules/effect/src/Scope.ts:322,506,593`.
- HTTP request/status/body and Web response conversion: `node_modules/effect/src/http/HttpClient.ts:186–223,820`; `HttpClientResponse.ts:78–151`.
- Process options/handle limitations: `node_modules/effect/src/process/ChildProcess.ts:443–545`; `ChildProcessSpawner.ts:86–180`.
- Transaction begin reference: `node_modules/effect/src/sql/SqlClient.ts:929`.

These are source-confirmed building blocks. Proposed declarations still owe compilation under the full diagnostic matrix.

## 6. Side-effect surfaces

### Database statements and transactions

`TranscriptStore` requests `SqlClient` from context. Compatibility receives the host’s existing better-sqlite3 handle and obtains `runtimeForHandle` from `@vidbee/db/legacy`. It neither opens nor closes that handle. The host calls `releaseHandle` before closing it.

Every transaction explicitly supplies `SqlClient.BeginTransaction = "BEGIN IMMEDIATE"`. Nested host transactions borrow savepoints through the db adapter. No transaction sleeps, performs asynchronous I/O or holds the permit across a yielding callback. Clock/ID operations used there must be synchronous; preserve their existing evaluation positions.

| Operation/source | Statements and ordering | Transaction |
| --- | --- | --- |
| Constructor / `applySchema`, `:147–167` | PRAGMA transcript columns; first migration pass; fresh transcript and segment columns; second pass | None added. Reproduce both passes and DDL order using strict SQL/DDL, not legacy imports. |
| `getById`, `:169`; by task, `:180`; latest, `:196` | Existing full-row SELECT, ordering and limit | None |
| Lists, `:212–250` | Download history by created time; current rows by updated time; head-only projections by created time | None |
| `hasCurrent`, `:262` | `SELECT 1 AS ok … LIMIT 1` | None |
| Playback cues, `:279` | Existing cue-only query, ordered start/sort index; never select `words_json` | None |
| Hydration, `:580–632` | Speakers ordered sort index; segments ordered start/sort index; words decoded separately; stored result kind unchanged | None; no new read snapshot |
| Commit, `:293–386` | Read clock and prospective transcript ID; lookup existing task outside transaction; supersede active rows unless inactive insert; insert transcript, speakers and segments; read back after commit | `BEGIN IMMEDIATE` |
| Append cues, `:389–417` | Read/validate caption transcript outside transaction; insert new cues preserving old IDs; update parent timestamp; read back | `BEGIN IMMEDIATE` |
| Delete download, `:424–440` | Select IDs first; for each delete segments, speakers, transcript in that order | `BEGIN IMMEDIATE` |
| Activate, `:448–480` | Read target/current first; supersede other current rows; clear target supersession; read back | `BEGIN IMMEDIATE` |
| Update/delete/insert segments, `:488–576` | Read first; preserve missing/no-op behavior; delete all segment rows, reinsert IDs/words/order, update parent; read back | `BEGIN IMMEDIATE` through `replaceSegments` |
| Legacy queue merge, `T/migrate-task-queue-db.ts:24–92` | Inspect source `sqlite_master`; target task count; ATTACH; task and attempt `INSERT OR IGNORE`; journal INSERT; DETACH in finally; counts; source close; conditional rename | **No transaction.** Preserve partial-copy behavior. |

Use `TranscriptRowFromSql`; derive speaker/segment projections from exported db model fields rather than demanding absent `transcript_id`. Head and playback shapes remain narrow. Existence uses `{ok: S.Finite}`; migration counts and sqlite-master names get their own query schemas.

Full-row and head decoders retain `TranscriptRow`’s `S.String` for `resultKind`. Hydration produces the stored read models from section 3 without a second literal-result decoder. Every full-record read and both head-list methods must return `"future-kind"` unchanged when that is the stored string.

Preserve SQL and memory differences. SQL allocates clock/prospective ID before its idempotence lookup; memory checks first. SQL returns fresh hydrated records; memory returns live records and mutates them in place. Do not add head/playback methods to the legacy memory class.

Migration source inspection is a separate scoped capability over the same driver family. It closes the source handle in the existing finally. Target operations use the shared contextual client, including ATTACH/DETACH; do not let another connection perform those statements.

No SQL streaming. Persistence tests run the borrowed and target clients in separate processes. Original driver-error identity is asserted on the borrowed client; native node-sqlite errors retain their own class/code.

### Process execution

Reuse phase 5’s `DownloadProcess` command-and-sink implementation and its `ProcessSpec`, `ProcessRun`, `ProcessSink` and `ProcessOutcome` models from the strict downloader package. Dependency direction allows transcription → downloader-core. Do not duplicate its raw/native observation model or import downloader-core-legacy into strict code.

The settled `DownloadProcess.start` returns a `ProcessRun`. It does not expose stdin, reaping, an intentionally unread output pipe or live Node signalling state. Transcription needs an additive acquisition contract with those capabilities. Existing downloader callers keep their contract and default output consumption.

```ts
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type * as PlatformError from "effect/PlatformError"
import type * as Scope from "effect/Scope"

// ProcessSpec, ProcessRun, ProcessSink and ProcessOutcome are the
// reviewed phase-5 models. HostFailure is transcription's bridge error.

export type ProcessOutputConsumption = "events" | "leaveUnread"

export interface TranscriptionProcessSpec extends ProcessSpec {
  readonly stdoutConsumption: ProcessOutputConsumption
  readonly stderrConsumption: ProcessOutputConsumption
}

export type LiveSignallingState =
  | {
      readonly _tag: "Raw"
      readonly killed: boolean
    }
  | {
      readonly _tag: "Native"
    }

export interface WorkerProcessRun {
  readonly process: ProcessRun
  readonly signallingState: Effect.Effect<LiveSignallingState, HostFailure>
  readonly writeInput: (bytes: Uint8Array) =>
    Effect.Effect<void, HostFailure>
  readonly endInput: Effect.Effect<void, HostFailure>
  readonly awaitReaped: Effect.Effect<ProcessOutcome, HostFailure>
  readonly terminate: (graceMs: number) =>
    Effect.Effect<void, HostFailure>
}

export type WorkerProcessStart =
  | {
      readonly _tag: "Acquired"
      readonly run: WorkerProcessRun
    }
  | {
      readonly _tag: "NativeSpawnFailure"
      readonly error: PlatformError.PlatformError
    }

export class TranscriptionProcess extends Context.Service<
  TranscriptionProcess,
  {
    readonly start: (
      spec: TranscriptionProcessSpec,
      sink: ProcessSink,
      owner: Scope.Scope
    ) => Effect.Effect<WorkerProcessStart, HostFailure>
  }
>()("@vidbee/transcription/TranscriptionProcess.service/TranscriptionProcess") {}

export class CaptionProcessOwner extends Context.Service<
  CaptionProcessOwner,
  {
    readonly capture: (
      spec: TranscriptionProcessSpec,
      timeoutMs: number
    ) => Effect.Effect<string, TranscriptionError>
  }
>()("@vidbee/transcription/CaptionProcessOwner.service/CaptionProcessOwner") {}
```

The implementation extends the shared process implementation once; the service above composes it with stdin and lifecycle support. Reconcile export names with the merged phase-5 package before implementation. Do not call the settled `start` and assert that its result has the additional fields.

`stdoutConsumption` and `stderrConsumption` are independent of fd disposition. `"leaveUnread"` is valid only with `"pipe"`: create the pipe but attach no consumer, emit no data/end events for it, and do not wait for a consumer to finish. `"events"` consumes a piped stream once and forwards its observations. `"ignore"` and `"inherit"` retain their fd semantics and use `"events"` as the inert consumption setting. Reject inconsistent specifications as internal configuration errors before spawning; no current caller produces one.

Compatibility implements `"leaveUnread"` with the existing Node pipe and no data listener, iterator, drain or discard sink. A drain changes backpressure, and `"ignore"` changes the child’s descriptor. Native leaves the corresponding handle stream unconsumed. The stock spawner’s internal buffering still differs from direct Node pipes; native tests and cutover evidence must retain that limitation.

`signallingState` in compatibility reads the current owned child’s actual `killed` property synchronously each time it is evaluated. It is not a snapshot at acquisition or completion. `process.signalChild` continues to call that child’s `kill`, so a successful signal changes the subsequent raw observation even while the child remains alive. PID/group/tree requests do not manufacture that flag.

Native returns the `"Native"` branch because the installed handle exposes no Node `child.killed`. Its heartbeat suppression uses the native attempt’s explicit termination-request state; it does not claim that state is a raw observation or proof of exit. Compatibility heartbeat suppression uses only the raw `killed` value at the existing interval position (`T/executor.ts:731–740`).

`awaitReaped` observes the existing completion policy; awaiting it does not send a signal. Compatibility completion remains Node `close`. `terminate` requests termination and then waits according to the worker policy. Signal acknowledgement and reaping remain distinct.

Compatibility `terminate` is `T/worker/terminate.ts:4–23`: already-exited/signal-exited/missing-PID resolves; end stdin; child-only TERM; unref’d escalation; child-only KILL if still alive; await close. `child.killed` is not an exit test.

All spawns inherit cwd. **D** means detached on POSIX, attached on Windows. Explicitly set native detachment/window options; stock defaults differ from Node defaults.

| Spawn site | Command and argv | Environment/output | Deadline and kill policy |
| --- | --- | --- | --- |
| Audio decode, `T/audio.ts:156` | FFmpeg: `-y -i source -ac 1 -ar 16000 -threads FFMPEG_ENCODE_THREADS -vn wav` | Inherited env; D, window not hidden; ignore/pipe/pipe. Stdout `leaveUnread`; stderr `events`, accumulating full chunk-decoded text | No deadline. Abort listener sends child TERM only; current pre-abort gap remains. |
| Remux/fallback, `T/audio.ts:109–139` | FFmpeg: `-y -i source -map 0:a:0 -vn -sn -dn -c copy audio-copy.m4a`; then same decode without `-vn` at that call | Same capture/priority behavior; stdout `leaveUnread`, stderr `events` | Same TERM-only policy; remove copy in finally |
| Audio-stream probe, `T/audio.ts:204` | ffprobe: `-v error -select_streams a -show_entries stream=codec_type -of csv=p=0 file` | Attached; default pipe/pipe/pipe; stdout `events`, stderr `leaveUnread`; stdin stays open and unwritten | No deadline/cancel. Error resolves true; close checks nonempty stdout. |
| Duration probe, `T/audio.ts:234` | ffprobe: `-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 file` | Same defaults; stdout `events`, stderr `leaveUnread`; stdin stays open and unwritten | No deadline/cancel. Error/invalid duration resolves zero. |
| Subtitle probe, `T/extract-captions.ts:95` | ffprobe: `-v error -select_streams s -show_entries stream=index,codec_name,codec_type:stream_tags=language,title -of json file` | Inherited env; D; ignore/pipe/pipe; stdout/stderr `events`, full capture; lower priority | 8 seconds; child TERM and immediate rejection, no compatibility reap/escalation |
| Subtitle extraction, `T/extract-captions.ts:139` | FFmpeg: `-v error -i file -map 0:index -f webvtt pipe:1` | Same; full capture; up to 24 tracks serially | 20 seconds; same TERM/immediate rejection; caller skips failure |
| Runtime version, `T/runtime.ts:57` | Candidate executable `-v` | Sync capture UTF-8; replacement `{...env,ELECTRON_RUN_AS_NODE:'1'}`; attached/default pipes | 8 seconds; execFileSync default TERM timeout/error behavior; catch → empty version |
| System lookup, `T/runtime.ts:123` | `where node` on Windows, otherwise `which node` | Sync capture; inherited env; first nonempty line | 5 seconds; default execFileSync timeout behavior; catch → null |
| Provider/runtime probe, `T/runtime.ts:293` | Runtime executable, `execArgv` then worker script | Supplied env, or live inheritance when absent; D; pipe/pipe/pipe; lower priority; both outputs `events`; JSON-line stdout; 12,000-character stderr tail | Default 120 seconds, provider benchmark 20 seconds; 50-ms log flush after probe-ok; terminate/reap before result |
| Recognition worker, `T/executor.ts:690` | Runtime executable, `execArgv` then worker script | Replacement `sherpaWorkerEnv`; D; pipe/pipe/pipe; lower priority; both outputs `events`; streaming UTF-8 JSON lines; stderr retained | No overall deadline. Result/error/cancel reaps with default one-second TERM→KILL; CPU recoverable exits restart at most twice by default |
| Archive extraction, `T/model-manager.ts:960` | `tar -xjf archive -C staging` | execFile default attached/window/env/capture behavior; stdout/stderr captured by execFile but otherwise unused | No explicit deadline; AbortSignal and execFile default TERM; retain default maxBuffer behavior |

The signal policy is child-only at these sites. Detachment does not authorize tree/group termination. Reusing `DownloadProcess` does not adopt downloader cancellation policies.

Compatibility retains raw error/exit/close, nullable code/signal, actual live and completion killed state and synchronous listener entry. Native has numeric exit or `PlatformError`, acquisition failure without a child, re-chunked streams and stock scope/group cleanup. It never fabricates raw observations.

Native outcomes are defined per site:

| Site | Native policy |
| --- | --- |
| Audio probes | Acquisition/handle failure takes current zero/true fallback. Numeric close-equivalent output follows current text calculation. Preserve requested unread pipes rather than adding discard consumers. |
| Audio conversion | Zero succeeds; nonzero uses numeric conversion error; failure carries actual platform message unless cancellation/no-audio handling already applies. |
| Caption capture | Zero returns text; nonzero/failure enters current empty/skip recovery. Timeout requests child termination and completes the caller immediately; the separate owner retains the process scope for eventual cleanup. |
| Worker probe | Acquisition/failure becomes probe failure data; valid probe result still requires owned worker termination before returning. |
| Recognition worker | Result/error protocol wins through the settle-once gate and reap. Exit without result becomes typed unexpected-exit data; numeric exit retains code, platform failure retains its message with no invented signal. Without cancellation it is eligible for bounded CPU restart as an unexpected exit. |
| Archive extraction | Nonzero/failure enters existing staged cleanup/incomplete-model recovery; cancellation retains abort precedence. |

Native input writes are serialized through one owned stdin feeder; do not run the handle stdin sink afresh for each message because completing it can close stdin. Parent start leaves stdin open for later cancel. Probe ends it after its probe message. An unwritten probe stdin is not automatically ended.

Worker and audio process scopes last through their attempts. Requested output streams are consumed once each, concurrently with exit observation; intentionally unread streams remain unread. Compatibility preserves chunk-local decoding where present. Native buffering, rechunking and cleanup differences require separate tests and phase-9.3 review before application cutover.

### Caption timeout ownership

Today `runCaptured` creates listeners and a timer (`T/extract-captions.ts:41–71`). At the deadline it calls `child.kill('SIGTERM')` and immediately rejects with `${bin} timed out after ${timeoutMs}ms` (`:50–53`). It does not await exit, escalate, remove the output listeners or reap before rejecting. A later `error` or `close` clears the timer and attempts to settle the already-settled Promise. Subtitle-probe failure becomes `[]` at `:95–114`; extraction failure skips that track at `:139–164`.

The native spawner registers a release finalizer at `node_modules/@effect/platform-node-shared/src/NodeChildProcessSpawner.ts:677–706`. Its termination path at `:584–614` waits for exit when `forceKillAfter` is absent. An individual capture must therefore not acquire its child in a scope that closes when the timeout result is returned.

`CaptionProcessOwner` is acquired once in the native caption layer. Its reaping scope lives for that layer’s composition-root lifetime. Each capture creates a child scope with `Scope.fork(ownerScope)` and supplies it to process acquisition with `Scope.provide(childScope)`. Output readers, exit observation and the single stdin feeder, when present, belong to that owner. The caller awaits a separate settle-once result.

The sequence is:

1. Acquire the process in its owner child scope, start output/exit observation and arm the existing deadline.
2. On zero/nonzero completion or failure before the deadline, cancel the timer and publish the existing success/failure result once.
3. At the deadline, enter the timeout gate, request child-only TERM through the non-waiting request operation, and publish the timeout failure. Do not call waiting `handle.kill`, close the process scope, interrupt the owner’s observers or await a reaper on this path.
4. The caller returns through its current empty/skip recovery while the owner continues observing and draining that capture. Late completion cannot replace the timeout result.
5. On eventual completion, the owner closes that capture’s child scope and removes its retained state. Cleanup failure is recorded independently; it cannot replace a result already delivered.
6. At composition-root shutdown, stop accepting captures and close the owner scope. Stock native finalization then terminates/waits for remaining processes according to its configured behavior. No new `forceKillAfter` or bounded shutdown is added here; shutdown can wait for a TERM-ignoring child. That native shutdown behavior is separate from the prompt capture timeout.

Compatibility keeps the existing Promise/listener lifetime and adds no new shutdown or descendant-cleanup policy. The owner arrangement defines native resource ownership while preserving the timeout caller’s completion boundary. Any proposal to introduce bounded escalation into the application’s caption path remains section-14 work.

### Network requests

The package owns model traffic and a general mirror-fetch wrapper. Cloud HTTP is supplied by desktop.

| Request/site | Method, URL and headers | Timeout/retry | Body and validation |
| --- | --- | --- | --- |
| Archive length, `T/model-manager.ts:1062–1080` | HEAD of each chosen archive candidate; no explicit headers | Per-URL header timeout, default 15 seconds. Helper receives one URL; ordinary failure → unknown length | No body read. Positive finite Content-Length or null |
| Model/archive download, `T/model-manager.ts:1113–1184` | GET chosen URL; no explicit headers | Same header timeout. Candidate loop in `installSpec`; no new generic retry schedule | Require OK/body; stream bytes to `.part.pid`; progress/hash each chunk; optional SHA-256. Content-Length is progress/reuse information, not a new exact-length check. |
| Directory member, `T/model-manager.ts:722–742` | GET `${candidate}/${member.name}` | Existing serial member/candidate logic | Pinned member hash; later member size/object checks |
| `fetchFirstOk`, `T/download-mirrors.ts:156–192` | Supplied URL sequence and original RequestInit | One attempt per URL; abort is not retried; last error retained | Return first OK Response without consuming body. Non-OK bodies are not newly read/cancelled. |
| `createGithubMirrorFetch`, `T/download-mirrors.ts:198–211` | URL extracted from string/URL/Request; original `init` forwarded | Official/proxy order from live preference; same helper | Return original Response. Preserve current loss of Request-only options when callers supply a Request without equivalent init. |

Candidate construction remains unchanged: official GitHub releases/API/user-content, `ghfast.top`, `gh-proxy.com`, mapped `www.modelscope.cn/.../resolve/master/...`, and catalog-pinned Hugging Face/ModelScope paths (`T/download-mirrors.ts:10–150`; `T/model-catalog.ts:40–59`). `resolveUrls` overrides selection exactly.

The 15-second timer ends when fetch returns headers. Body streaming has no such deadline. Cancellation during streaming belongs to the pipeline signal. Do not wrap the whole download in a timeout.

Native `ModelHttp` uses Effect HttpClient with explicit status handling, redirects and no automatic retry. Disable added propagation headers where exact request shape matters. Compatibility invokes the captured fetch implementation with original URL/init shape and attempt signal, retains original Response identity and translates transport failures back to original values. Merely setting `FetchHttpClient.Fetch` is insufficient evidence of parity: the installed fetch client constructs its own headers/options (`node_modules/effect/src/http/FetchHttpClient.ts:119–151`).

Desktop cloud requests remain outside this phase’s transport implementation:

| Host request, `M/cloud-transcription.ts` | Existing contract retained by callback bridge |
| --- | --- |
| `:14` capabilities GET `/api/ai/transcription/capabilities` | Cookie header; 10 seconds; response JSON; existing catalog checks and errors |
| `:89` POST `/api/ai/transcription?requestId=…&modelId=…` | Cookie and `Content-Type: audio/wav`; canonical clip bytes; user abort combined with 105 seconds; JSON read before status handling; identity/text/credit checks |
| `:74` POST `/api/ai/prompt/cancel` on abort | Cookie and JSON content type; `{requestId}`; 10 seconds; detached failure swallowed |

Credentials and credit notifications stay in desktop. The cloud runner does not absorb account/network responsibilities.

### Files and publication

`TranscriptionFiles.readText` matches Node UTF-8: invalid sequences replaced, BOM preserved. Native reads bytes and decodes with `new TextDecoder("utf-8", {ignoreBOM:true})`. Caption parsers then remove a leading BOM themselves; JSON readers still reject it. `exists` is false on access failure, matching `existsSync`; do not substitute the narrower stock existence recovery.

| Surface | Names, operations and residue retained |
| --- | --- |
| Audio | Recursive output directory; `audio-16k-mono.wav`; reuse after duration probe; fallback `audio-copy.m4a` removed in finally. No new scratch cleanup on other failures. |
| Worker scratch | `<root>/vidbee-transcript/<24-hex-key>`; chunks, stages, seed and pipeline-result files. Local success deletes scratch and partials **before** DB commit. Failed jobs retain checkpoints; cancellation deletes scratch. Removal guard remains the separator-delimited substring test (`T/executor.ts:62–72`). |
| Atomic JSON, `T/atomic-file.ts:30–88` | `${target}.tmp.${pid}.${12-hex}`; direct write then rename; default creation modes; no fsync/chmod. Missing parent becomes cancellation; failed publication removes own temp; ENOENT with destination already present succeeds. Preserve cleanup-error precedence. |
| Model raw files | `${dest}.part.${pid}`; truncating stream write; failure removes part; existing published destination wins before hash check; rename publication tolerates peer publication. |
| Archives | `.downloads/<archive>` and `.extracted`; unique `.staging.pid.12hex`; lock directory with PID file; stale rename `.stale.pid.8hex`; staged validation; sequential root removal/rename; marker `"ok"` last; staging removed in finally. |
| Directory-shaped models | Recursive directory creation; invalid member removed before download; member checks and assessment cache retained. |
| Probe cache | Default temp `vidbee-runtime-probe.json`; load per get/set; atomic rewrite; read/syntax failure alone supplies `{}`. Valid JSON roots keep section 3’s lookup/spread behavior. |
| Cloud | `<workRoot>/vidbee-transcript/<key>/cloud.json`; fixed `.tmp`, write then rename; request ID saved before upload, result after upload; file handle closed in finally; cleanup returned for after commit and internally swallows removal failure. |

Preserve default modes and umask behavior. No writer gains fsync, rollback, chmod, extra containment or a universal atomic-write helper.

Cloud clips are at most 20 seconds, split near a quiet 100-ms window after 15 seconds, with the existing equal-energy tie rule. Account equality, audio-boundary matching, two-iteration reservation recovery and request-ID rotation remain exactly at `T/cloud-runner.ts:153–208`.

### Timers and clocks

| Site | Purpose and value | Keeps process alive today | Mapping |
| --- | --- | --- | --- |
| `T/download-mirrors.ts:170` | Header deadline, default 15 seconds | Yes until cleared | `TranscriptionTime.after`, keepAlive true |
| `T/model-manager.ts:99,181–219` | 25-ms archive-lock polling; 60-second deadline; PID-less lock fresh for two seconds | Poll timer yes; deadline/age are clock reads | `sleep` and wall-clock `now`; retain `now > deadline` |
| `T/model-manager.ts:1191` | 200-ms progress throttle; forced emissions bypass | No timer | `now` at emission |
| `T/init-models.ts:16–55` | Retry delays 0, 5s, 15s, 45s, 120s, 600s; injected schedule | Yes | `after`, keepAlive true; preserve timer truthiness check and unused `now` option |
| `T/runtime.ts:346,361` | Probe deadline 120s/default or 20s benchmark; 50-ms trailing-log flush | Yes | `after`, keepAlive true |
| `T/extract-captions.ts:50` | 8s subtitle probe; 20s extraction | Yes | `after`, keepAlive true; timeout delivery stays separate from native owner cleanup |
| `T/executor.ts:731` | Parent worker-alive interval, 10s; stops on committing/settlement and suppresses emission when live `child.killed` is true | **No**, unref’d | `every`, keepAlive false; read live signalling state inside each callback |
| `T/worker/entry.ts:164` | Worker stage heartbeat, 10s; blocked by native calls | Yes | `every`, keepAlive true |
| `T/worker/terminate.ts:10` | One-second TERM→KILL grace, configurable | **No**, unref’d | `after`, keepAlive false |
| `T/pipeline-fake.ts:75` | Optional artificial delay | Yes | `sleep`; abort checked before/after, not newly interrupting sleep |
| `T/worker/protocol.ts:127` | Blocking one-ms EAGAIN retry wait | Synchronous wait | Compatibility worker-output capability; native backpressure is distinct |
| `T/executor.ts:179` | Start execution after returning handle | Microtask only | `microtask`; not `sleep(0)` |
| `T/transcript-store.ts`, `memory-store.ts` | Creation/update/supersession timestamps | Clock only | Injected clock or wall-clock `now`, old call positions |
| `T/executor.ts:172,235–237,313,326,776` | Finish/spawn/tick timestamps | Clock only | Wall-clock `now`; retain separate reads |
| `T/partial-buffer.ts:81` | Stage-history start time | Clock only | Wall-clock `now` |
| `T/worker/entry.ts:63–65` | Probe inference elapsed time | Clock only | Two synchronous monotonic reads inside `RecognizerSession.probe`, immediately around native decode |

No calendar `new Date` operation was found.

The installed Clock and queue timer layer do not expose Node timer `unref`; the queue native layer ignores its `keepAlive` argument (`packages/task-queue/src/QueueTimers.layer.ts:15–23`). Compatibility implements reference semantics exactly. Native reference behavior remains an explicit capability/cutover question in section 12.

## 7. Pure modules

Tier selection, recommendation calculations, word grouping, caption parsing, source selection, transcript edits, punctuation alignment, speaker clustering/refinement and waveform envelope construction retain their algorithms and synchronous signatures wherever representable.

Changes forced by the rule set:

- Native internal collections become Effect collections. Keep explicit ordered key arrays where first appearance, ties, insertion order, pending flush order or cache replacement matter. HashMap iteration is not Map iteration.
- Native-Map public signatures have compatibility adapters; unchanged array-returning algorithms remain at their existing export.
- Pure path calculations receive explicit host path behavior. Compatibility supplies Node semantics. Do not silently make host-sensitive helpers portable.
- SHA-256 work-key hashing remains synchronous, with identical bytes and test vectors. Async crypto would add a suspension.
- JSON parsing/serialization uses Schema. Tolerant algorithms first decode unknown JSON and preserve current branch checks, including probe-cache root lookup/spread.
- Add `Function.dual` where `missingPipeableSignature` requires it without removing old call forms.
- Use `Effect.fn`/`fnUntraced` for generator functions. No native `async`, timers, Date/JSON/fetch globals, diagnostic overrides, suppressions or `any` casts are introduced.
- Keep vector mutation, Float32 rounding, stable sort ties, object identity, soft grouping caps, punctuation fallback and optional fields. Collection replacement is not permission to copy live memory-store records.
- Read-side helpers accept stored result-kind strings without introducing a literal decoder; their existing `'transcript'` and `'no-speech'` comparisons retain their meaning.

The strict root and renderer-safe subpaths must not eagerly load sherpa, Node process adapters or filesystem capabilities. Driver acquisition is lazy. Import-only Node and browser bundle tests enforce that boundary.

## 8. The compatibility package

The sibling exposes the same seven entry paths and old callable API where required. Pure exports can be re-exported, but consumers of unchanged pure functions keep their current imports.

Additional test access may use sibling-relative files retaining `runtime.ts` and `worker/terminate.ts`; it need not turn internal lifecycle helpers into permanent public exports.

Implementation obligations:

- Constructors preserve synchronous work: model directory creation; SQL schema application; no new asynchronous initialization prerequisite.
- Sync methods use the warmed synchronous runner and synchronous capabilities. A filesystem-backed native Effect layer is not used under these facades.
- Promise methods use the shared exit-observer settlement utility and named timing turns.
- Callback adapters retain function identity and original injected seams: fetch, URL resolver, preference callback, archive-staged hook, clock, scheduler, probe/cache, cloud/in-process runner, addon and store/queue interfaces.
- Legacy native-Map adapters preserve iteration order and returned identity where the old algorithm returns its input unchanged, including `capExcessClusters`.
- SQL read adapters retain arbitrary stored result-kind strings while preserving the old public declarations. That existing unchecked declaration is confined to the unported boundary; strict services expose wider read models.
- Process adapters retain piped-but-unread outputs, open unwritten stdin, live `child.killed`, and the distinction between sending a signal and observing termination.
- Worker compatibility composition supplies blocking stdout, signal/error handlers, synchronous JSON patch, environment and legacy timing while invoking ported pipeline/worker logic. It is not a second copy of recognition or checkpoint algorithms.
- `worker/entry.ts` remains an entrypoint. Split reusable worker handling from top-level composition so compatibility can run it without evaluating native composition first.
- No `stop`, cancel or task finish disposes an owner runtime that remains callable. Explicit disposal is composition-root lifetime work, without adding old public shutdown side effects.
- Caption timeout retains its immediate Promise rejection and existing late-listener behavior; the native caption owner is not installed under the legacy facade.
- JavaScript/CJS helper scripts retain their implementation style; the model-download script’s import points to the old API when necessary.

Wiring:

| Surface | Required change |
| --- | --- |
| Manifests | Add sibling; retain core in desktop for P imports; add sibling dependency. Strict package depends on strict task-queue/downloader/db/i18n contracts. Sibling owns legacy workspace dependencies. Internal versions `workspace:^`; third-party versions `catalog:`. |
| Native libraries | sherpa and OpenCC remain behind their single drivers. Keep native packaging externals/unpack/copy rules; do not duplicate addon loading in compatibility. |
| Desktop bundling | Add sibling beside core in `bundledWorkspacePackages`, `apps/desktop/electron.vite.config.ts:16–35`. Change transcription-worker build input at `:82–85` to compatibility composition for this phase. Keep output filename/location. |
| Packaged resolution | Check main and worker bundles for unresolved workspace imports; launch the actual packaged worker, not only source fixtures. |
| Typechecking | Strict source/test configs extend root base. Sibling retains unported settings and explicit `tsc --noEmit`. Root check includes both. |
| Tests | Add strict `@effect/vitest` package suite and root Turbo filter. Add compatibility characterization suite to `test:audit` glob if node:test. Preserve desktop lifecycle inclusion. |
| Lint | Add core to root Biome scope; do not broaden formatting over sibling or helper scripts. |
| Ratchet | Core and its tests pass full tsrs/port-check; sibling is visibly unported. No allowlist or lowered rule. |
| Phase 10 | Remove sibling exports, compatibility worker composition, timing/settlement bridges and remaining legacy dependencies after consumers move. |

## 9. Deliberate changes

Only requirements-forced boundary rejection and logging changes are proposed. They must be recorded in `OWNER-REVIEW.md` with old/new characterization cases.

1. **Rows that cannot inhabit the db models fail with `DbRowDecodeError`.** Today casts can return wrong-shaped values. Preserve source-kind/default normalization and narrow-query shape; do not skip rows or fall back to memory inside this package. Desktop retains its existing setup catch. An arbitrary string `result_kind` inhabits the db model and remains readable; this exception does not authorize rejecting it.
2. **Previously accepted non-finite boundary numbers are rejected or filtered at the existing tolerant boundary.** JSON can parse an exponent such as `1e999` to Infinity. SQL, worker results, persisted chunks/seeds/stages and native observations use `S.Finite`. Words/stage items follow their existing element-filter policy; required result/row fields fail.
3. **Known protocol/result/checkpoint shapes that pass today’s casts but cannot be consumed safely fail decoding.** Unknown protocol kinds remain ignored; invalid JSON retains current recovery. A recognized malformed worker message terminates that attempt with `BoundaryDecodeError`; an unusable result fails before commit; unusable consumed checkpoint content fails that operation rather than being silently erased or overwritten. Compatibility reports `Error("Invalid transcription data at ${boundary}.")` for these newly rejected cases, with a stable content-free boundary identifier. Existing syntax/traversal failures keep their old behavior. Runtime probe-cache roots are decoded to unknown and retain section 3’s behavior; arrays, primitives and null are not newly rejected as malformed records.
4. **Package logging uses Effect logging with full Causes.** Injected logger-hook invocation order and thrown-hook behavior remain; default line shape may change under D33/D34.

Do not broadly reject unexpected metadata or unknown keys. The implementation report enumerates each newly rejected fixture path. These exceptions do not authorize changing goldens for ordinary behavior.

Native process scheduling, raw-observation loss, stdout backpressure, scope cleanup and timer reference differences are not accepted application changes here. Compatibility remains wired into desktop. Their native tests and phase-9.3 handoff are required.

The process consumption/signalling additions, separate probe measurement operation, wider stored read models, JSON-unknown cache handling and caption timeout owner resolve contract gaps. They do not authorize further changes to unported consumers.

## 10. Verification the implementation owes

### Characterization before porting

Write tests against the old implementation first. Keep assertions unchanged through the port, apart from explicit section-9 old/new cases. Preserve old declaration fixtures and immutable data fixtures.

| Area | Required fixtures and assertions |
| --- | --- |
| Public surface | Every entry, alias identity, mutable/readonly declarations, default parameters, synchronous result/throw versus Promise rejection, import-time work; legacy declaration fixtures separate from wider strict stored-read fixtures |
| SQL store | Fresh/old schemas, all queries and begin modes, nested borrowed transaction, rollback at each write, idempotence/supersession, inactive insert, duplicate speaker keys, edit/no-op/null cases, head/playback query shape, corrupt words and original driver errors |
| Stored result kind | Insert a db-model-valid row with `result_kind = "future-kind"`; assert unchanged full-record output through ID/task/latest/history/current reads and unchanged output through `listHeads`/`listHeadsForDownload`; assert source/seed predicates keep their current literal comparisons |
| Memory store | Live returned objects, external mutation, aliasing of words, stable insertion/tie order and documented differences from SQL |
| Caption parsing/import | VTT/SRT/ASS with BOM, malformed stamps, voice names, commas/markup, AI/chat tags, Chinese scripts, multiple languages, sidecar enumeration, unreadable files and partial multi-language commits |
| ASR configuration | All five families, missing role combinations, tier aliases, language no-op, provider/debug/thread values |
| Provider probe | Fake-addon trace and fake monotonic clock; exact stream/setup/inputFinished/decode/result order, warmup/measured sample lengths, decode-only durations and threshold-sensitive selection |
| Speaker algorithms | Small fixed vectors, equal distances, zero vectors, Float32 mutation, overlap windows, fold/cap thresholds, missing embeddings, fixed/auto speaker counts, wordless long captions, sentence boundaries and soft caps |
| Checkpoints | Unknown keys at every retained level; missing/defaulted arrays; malformed JSON/shapes; key mismatch; append dedup; stage nonrewind; seed preference; atomic failures and residue |
| Runtime probe cache | Object, array, string, number, boolean and null roots; absent/present/inherited property lookup; string/array spread; null `get` TypeError and successful null `set`; read/syntax fallback; original truthiness/identity selection branches |
| Models | Tiny raw files, pinned directory members and tar fixtures; checksum failures; candidate order; partial/stale archive; two managers and two processes; PID-lock takeover/live owner; overlapping tiers; cancellation and publication races |
| HTTP | Recording injected fetch; exact arguments, Response identity, non-OK/throw/non-Error behavior, user abort, header timeout followed by slow body, HEAD failure, unknown/incorrect length, ordered mirror candidates |
| Executor/worker | Fake scripts for progress/partial/log/result/error, split UTF-8, multiple lines, final unterminated line, inline/file result precedence, missing result, crash/restart, accelerator fallback, late output, hook throws and re-entry |
| Process consumption | A child fills an intentionally unread stdout pipe during conversion, and an intentionally unread stderr pipe during probing; assert stalled writer/no data delivery until test-owned release, then completion; distinguish pipe from ignore and drain |
| Lifecycle | Result/error/cancel/pause reap before finish; TERM-ignoring child; killed-but-alive child; missing PID; competing close/error; cancellation immediately before heartbeat; scratch-before-commit and cloud-after-commit ordering |
| Caption timeout | Old and compatibility caller rejection before child exit, child-only TERM and no escalation; native caller timeout before reaping, owner retention, late completion cleanup and composition-root shutdown behavior |
| Coordinator | Stop/remove during caption import; overlapping events/flush; disabled/models-not-ready; current transcript recheck; no history backfill |
| Cloud runner | Generated PCM RIFF chunks; quiet-boundary ties; short/changed reads; account mismatch; saved paid result replay; ID-before-upload; ambiguous failure; 409 reservation rotation; cleanup and callback failure |
| Timing | Immediate markers, every old await/continuation, promise settlement, manager sync prefix, one-microtask executor start, listener throw/re-entry, timer handles/ref state, cache/pending publication order |

The provider trace must distinguish ordinary decode from probe decode. Ordinary recognition omits `inputFinished`; probe calls it when available. Record:

`createStream → acceptWaveform → inputFinished? → clock → decode → clock → getResult`.

Result parsing/repair/decoding must finish before a probe succeeds, while contributing no time to the recorded duration. Pin benchmark warmup at 0.2 seconds, measured benchmark at one second, and ordinary runtime probe at 0.3 seconds. With accelerator decode 94 ms, CPU decode 100 ms and 40 ms of setup/result overhead per call, selection remains accelerator; measuring whole calls would incorrectly select CPU. Also pin the exact 95-ms threshold against a 100-ms CPU decode.

The heartbeat case arms the parent’s ten-second interval, cancels immediately before the deadline, and uses a child that acknowledges TERM delivery by remaining alive. Assert that compatibility reads `killed === true`, suppresses `worker-alive` during the grace period, does not treat that flag as exit, and still escalates/reaps before task finish.

The native caption case uses a TERM-ignoring child and an independently controlled eventual exit. Assert timeout failure and the caller’s empty/skip recovery while the child is still alive and its owner scope remains open. Then release the child and assert observer/scope cleanup. A separate shutdown case begins closing the owner, proves shutdown is still pending while the child ignores TERM, then releases the child and verifies finalization. Test cleanup may use its own explicit release or KILL; production capture gains no escalation from that test.

Use recording layers as well as TestClock. TestClock alone does not establish handle counts, unref semantics, injected scheduler behavior or callback launch order.

### Node oracle

Vitest runs with `bunx --bun vitest run`. Node-specific comparisons run in explicit Node subprocesses selected at the pinned Node 22.23.4 version, verified before execution. Do not use ambient `process.execPath` from Bun-hosted Vitest as the oracle interpreter.

Compare old and compatibility traces for:

- Spawn failure, raw error/exit/close, nullable code/signal, live and completion killed flag, TERM→KILL escalation and descendants holding pipes.
- Intentionally unread output pipes, writer backpressure, open unwritten stdin, and signal acknowledgement before process exit.
- Callback synchronous prefixes, throws and nested runtime re-entry.
- Per-chunk versus streaming UTF-8; stdin/close behavior; unterminated protocol lines.
- Native JSON syntax messages and sherpa control-character repair/restoration.
- Probe-cache JSON root lookup/spread and null traversal failure.
- WAV out-of-range reads, truncated chunks and 32-bit float semantics.
- POSIX/Windows path calculations, permission probes, rename races and cleanup-error precedence.
- Blocking protocol short writes/EAGAIN, invalid write counts and repeated retry.
- execFile timeout/abort/maxBuffer errors and captured-output behavior.
- Caption timeout settlement before eventual child completion.

Assert error identity inside each subprocess and serialize that assertion. Normalize only fixture roots, PIDs and timestamps. Native-layer tests assert the defined native outcomes and known differences separately.

### Existing suites and persistence proof

Retain the six lifecycle cases in `apps/desktop/test/transcription-lifecycle.test.ts:17–203`, gallery-source tests, queue transcription admission/output tests and db transcript-migration preservation tests.

Run every transcription persistence assertion against borrowed better-sqlite3 and node-sqlite clients in separate processes. Include source-merge ATTACH behavior and source lifetime. Never open both driver families on the same file in one process.

On a copy of the owner’s persisted data, enumerate/decode:

- Transcript, speaker and segment rows, including superseded records and stored result-kind strings outside the produced-result kit.
- Words JSON and head/playback projections.
- Existing checkpoint/seed/stage/cloud/probe-cache formats where present.
- Model status and directory-assessment paths without repair or redownload.

Report counts, schema paths, issue categories and zero/nonzero failure totals only; never transcript text, filenames containing private content, account IDs or payloads. Verify database integrity/foreign keys and unchanged row counts; use private local comparison assertions to detect content changes without emitting content. This is persisted-data proof, not a live-profile launch.

### Goldens to record before phase 6c

`--models` copies a supplied directory containing `transcription/` into the synthetic profile (`GOLDENS.md`; `apps/desktop/scripts/port/golden/run.mjs:120–132`). It currently does **not** implement a successful ASR case. Add and repeatedly record these cases on the packaged build preceding this phase.

| New case | Fixture and public observation |
| --- | --- |
| `transcription-local-complete` | Fixed spoken-audio bytes, imported through public local-media API; local/minimal model, CPU, fixed UI language and speaker-count setting. Assert the app-reported provider, observe admission through completion, and read full transcript/words/speakers, export and physical persistence. |
| `transcription-auto-no-speech` | Loopback-served silence media downloaded with auto transcription enabled. Observe download completion, automatic child and VAD no-speech result; verify stored row and no segments. |
| `transcription-auto-caption` | Downloaded media with embedded text captions in at least two languages, including named speakers/AI-tag distinction. Observe caption selection/import, source switching and stored results without accidental ASR replacement. |
| `transcription-rediarize` | Completed local ASR and imported-caption records; rediarize with one speaker and a fixed multi-speaker setting. Verify preserved text/source, new active history and speaker output. |
| `transcription-cancel-active` | Long spoken fixture. Cancel only after public recognizing/partial evidence; verify cancellation, no committed replacement, and eventual worker release. |
| `transcription-force-and-retry` | Existing transcript plus explicit force; a deterministic missing-source failure restored before manual retry. Verify task reuse/new admission, attempts and preserved prior transcript. |
| `transcription-restart-readback` | Reopen the same physical synthetic profile after successful ASR/caption mutations; verify history, active source, text/words/speakers and task result. |
| `transcription-model-ready` | Supplied model directory; status and already-installed ensure behavior with no required download. Preserve existing model invalid-action cases. |

CPU selection uses the golden harness’s existing GPU-disabled execution environment. The launcher passes `--disable-gpu` (`apps/desktop/scripts/port/offline-launch.sh:67`); the baseline is run with GPU access disabled so the app’s GPU probe fails and the normal provider-selection path selects CPU. The host catches GPU-probe failure and returns an empty GPU inventory (`M/transcript-host.ts:771–789`), which it supplies to the executor through `resolveTranscriptionGpuKinds` (`:801–802`; `M/task-queue-host.ts:252–271`).

This is an execution-environment constraint, not a new provider selector or `skipProbe` setting. An empty inventory alone does not force a CPU-only candidate list: `sherpaProviderCandidates` can still try CUDA on a compatible architecture (`T/compute-provider.ts:46–66`). The case must therefore assert the actual selected provider from the public task log before accepting either a recording or a comparison. Require `compute.provider=cpu`, including the worker’s report (`T/worker/entry.ts:168`), and retain selection/probe logs. A GPU-disabled run that reports an accelerator fails the prerequisite; supplying `--models` or normalizing hardware fields cannot make it an accepted CPU baseline.

The recorded baseline and every later run use the same complete model set. Record SHA-256 checksums by model-relative filename for every supplied model file, including segmentation, embedding, VAD, punctuation, Whisper encoder/decoder/tokens and any model configuration files. Include the manifest in the phase report with model versions and fixture checksums. Verify it before recording and before each comparison; an added, missing or changed model file invalidates the comparison until a separately reviewed baseline is recorded. Keep the supplied set free of unrelated models that could change fallback selection.

The default minimal-ready set is larger than “VAD, embedding and Whisper tiny”: `MINIMAL_MODEL_GROUPS = ['vad','speaker','asr']`, and `speaker` includes **pyannote segmentation** (`T/model-catalog.ts:63–100,561`). Default automatic diarization needs segmentation plus embedding. A one-speaker ASR case can skip diarization, but that does not prove the default path or make the default manager status ready.

Supply pinned Silero VAD, pyannote segmentation, CAM++ embedding, punctuation weights and Whisper tiny encoder/decoder/tokens. The selected model set includes punctuation, and the cases include text that exercises its acquisition/use rather than relying only on optional-download fallback. The weights are never committed.

The spoken fixture must contain actual fixed speech, not a sine wave. Use a redistributable spoken sample shipped with the supplied model set, with provenance, fixed sample rate/bytes and a two-speaker variant. Silence and containers can be generated deterministically.

The loopback server must serve:

- Fixed speech/silence media bytes and a container with embedded text subtitle streams.
- Correct MIME, Content-Length, stable Last-Modified, HEAD and byte ranges, including repeat requests.
- Throttled bodies for observed-progress cancellation where applicable.
- For separate installer integration tests, tiny raw assets, checksum manifests, tar.bz2 archives and pinned directory members, with failed/slow-header/truncated-body variants.

Model-manager URL override tests can use those installer routes. The packaged public app has no general catalog-URL override, so tiny fake model files do not prove public model installation or real sherpa loading.

Subscribe to public events before admission and use bounded condition waits. Record stable final text/times/source/history/output and meaningful lifecycle states. Do not require every transient partial to be observed or pin heartbeat counts/speeds. Keep raw events and request logs. Any new normalization rule must be named and justified; media duration, transcript contents and the CPU provider assertion remain meaningful.

Repeat recordings/comparisons to establish determinism before porting. If native output or speaker timing is unstable on the pinned fixture and model set, resolve fixture/provider selection or bring the unresolved field to review; do not broadly erase it.

### Gates and manual proof

Run strict package checks, ratchet, whole-repo check/tests/catalog, Linux package, CLI build and goldens in port-guide order. Preserved behavior has zero golden changes.

Offline manual exercise on an isolated profile covers model-ready startup; spoken media; silence; captions and source switching; one/multiple speakers; partial stream; pause/cancel/retry/force; edit/export; restart and checkpoint restoration. Exercise the packaged compatibility worker and verify that no owned worker remains after terminal completion.

Real-ASR cases are required for the local phase gate. Hosted CI skips them with a clear message when the supplied models are absent; the phase report carries the required local baseline and comparison runs, provider assertions and checksum manifest. A hosted skip does not establish ASR acceptance.

Without network access, this phase cannot verify current GitHub/proxy/ModelScope availability, redirects/CDN behavior, real model transfer throughput, authenticated cloud billing/cancellation/replay, account refresh or remote-platform captions. Loopback and injected callbacks prove local contracts only. Windows/macOS compile and fixture coverage do not constitute platform launch proof.

## 11. Behavior kept as it is

Candidates for owner review, not fixes:

- SQL idempotence lookup is outside the transaction; a superseded task can receive another transcript. SQL and memory allocate time/IDs at different points.
- Memory records are live references; SQL records are fresh hydration. Memory has no narrow head/playback API.
- SQL full/head reads return arbitrary stored result-kind strings unchanged despite their narrower old TypeScript declarations.
- Worker scratch and partials are removed before DB commit; a failed commit loses the local checkpoint. Cloud scratch is removed after commit. Cancellation can leave partial singleton state.
- Model ensure keys preserve caller order. Overlapping tier ensures can overwrite tier-controller entries. Shared non-tier installs omit tier cancellation.
- `redownload` bypasses the normal tier-busy guard and removes shared cache. Ordinary nonempty files count installed without rehash.
- Peer publication can win before the current attempt’s hash check. Raw publication has no cross-instance archive lock.
- Archive detection accepts gzip/tgz forms, but extraction always uses `tar -xjf`.
- Multi-root publication removes/renames roots sequentially. Tier purge does not acquire archive publication locks.
- Tokenizer assessment cache omits `json` and repair-hint flags; metadata-preserving file changes can evade its key.
- The sherpa result reader temporarily patches global JSON.parse synchronously.
- Worker stdout uses a private blocking-handle API and retries EAGAIN indefinitely.
- Worker result paths are not confined to workdir. Truthy inline result wins.
- Worker entry has no one-request guard despite its comment; multiple messages can start overlapping handlers.
- ASR preparation starts before audio extraction is awaited; extraction can fail before preparation is awaited.
- Worker signals abort cooperative state; native calls can delay signal processing.
- Runtime path-only resolution does not validate the same baseline/probes as async resolution. The last candidate can be selected after a failed probe.
- Runtime probe-cache loading accepts every valid JSON root. Null lookup throws outside the loader catch; set spreads the loaded root before adding a key.
- Provider probing times only native decode, calls optional `inputFinished` and keeps warmup separate. Ordinary recognition does not call `inputFinished`.
- Audio probes have no deadline/cancel. Audio decode has a pre-aborted-signal gap and unconsumed stdout; probes leave stderr unread and stdin open.
- The parent suppresses heartbeat after a successful owned-child signal even while that child remains alive.
- Caption timeout requests TERM and rejects without escalation/reaping; late listeners remain.
- VAD only runs for eligible automatic work. ASR fills uncovered timeline gaps; VAD is not a simple recognition mask.
- Empty recognized text is not checkpointed. A successful `'transcript'` result can have zero segments.
- UI language controls Chinese script, while ASR language remains auto-detected.
- `embeddingIdForLanguage` ignores language. Refinement/turn helpers retain ignored parameters.
- Wordless captions receive synthetic proportional timing for assignment but keep empty output words. Grouping caps are soft; overlapping token ends can move a segment end backward.
- Time edits do not shift word times. An explicit text patch drops words even when text is unchanged.
- “Human captions” includes platform AI dialogue. Refinement can remove an AI-prefixed language distinction before deduplication.
- Embedded languages commit separately; later failure leaves earlier commits.
- Cloud checkpoints have no explicit version/model field; the directory key carries model. Fixed `.tmp` can collide.
- Legacy queue merge is nontransactional, journal insert is not deduplicated, and attempt/journal counts are target totals. Existing backup suppresses rename but not merge.
- Minimal-fill stop does not cancel in-flight ensure or suppress successful `onReady`; its `now` option is unused.
- Mirror header timeout does not limit body duration. The mirror wrapper extracts a Request URL without automatically preserving Request-only options.

## 12. Decisions on the draft's open questions

The recorded decisions were taken on 2026-11-18. The independent review resolutions below supplement them.

Real-ASR golden: required for this phase’s local gate, run with a supplied models directory containing voice activity, speaker embedding, speaker segmentation, punctuation and the smallest Whisper model, and a spoken sample shipped with the model set. The models are large binaries and are never committed. Hosted CI skips these cases with a clear message when models are absent; the phase report carries the required local runs. The new cases are recorded on the build before this phase. The existing GPU-disabled launch supplies the CPU baseline mechanism; every accepted recording/comparison asserts the app-reported CPU provider and uses the identical model set verified by report-recorded file checksums.

The directive settles package shape, compatibility, database ownership and callback direction. The following decisions govern implementation:

| Question | Options | Decision |
| --- | --- | --- |
| **Strict native sherpa result repair** | Keep compatibility result-reader capability until cutover; or use the installed addon’s raw `getOfflineStreamResultAsJson(stream.handle)` behind the one driver and Schema-decode/repair there. The public wrapper calls JSON.parse internally (`node_modules/sherpa-onnx-node/non-streaming-asr.js:149–151`). | Compatibility preserves today’s patch now. Prototype raw-result access with Node oracle before choosing native implementation; verify package subpath resolution, handle typing and exact repair predicate. Do not assume an unconfirmed public raw-result API. |
| **Native worker stdout** | Effect `Stdio` with awaited backpressure between native steps; or retain a narrow blocking-output host capability. Stock NodeStdio uses writable sinks and does not expose `_handle.setBlocking` or synchronous short-write retries. | Keep exact blocking output in compatibility. Prefer awaited native output if packaged stress tests prove watchdog and throughput behavior; review new suspension points before phase-9.3 cutover. |
| **Native timer reference semantics** | Provide an explicit Node timer primitive at composition; extend a shared platform timer capability; or accept referenced native sleeps at cutover. Stock Clock/queue timers do not implement unref. | Share an explicit timer capability and retain compatibility unref now. Do not claim native process-exit parity until handle-reference tests pass. |
| **Host primitives absent from Effect contracts** | Supply machine/module-resolution/process metadata through a platform composition record; or introduce a separately reviewed platform driver dependency. No confirmed Effect API covers every current host probe. | Use explicit host primitives supplied at composition for phase 6c, with exact Node compatibility. Decide their permanent platform owner during desktop foundation; no invented OS/module API or diagnostic workaround. |
| **New malformed-data policy** | Fail the affected operation as proposed; skip records; or reset bad checkpoints. Decoding is required, but recovery is a product decision beyond casts. | Fail operation with content-free issue paths as specified in section 9. Preserve all existing tolerant recovery. Never silently reset a cloud checkpoint or erase paid-result identities. Characterize section 9’s exact boundary messages before implementation. |
| **Native unexpected-worker failure/restart** | Retry all unexpected platform failures within the existing bound; or retry only failures identifiable from numeric code. Raw signal identity is unavailable. | Use the bounded unexpected-exit policy in section 6, retain platform message and no invented signal, and review differential traces before native application cutover. Compatibility retains exact current signal/code classification. |
| **Real-ASR golden prerequisite** | Require a supplied complete pinned model set for phase acceptance; or allow a reported native-ASR skip. | Require the complete set and a real spoken fixture for phase 6c acceptance. A skip cannot establish the package’s central end-to-end path. Include segmentation and punctuation coverage. Use the GPU-disabled harness, assert reported CPU and verify the same file-checksum manifest on the baseline and every later run. |
| **Shared process contract availability** | Consume phase-5 `DownloadProcess` after it merges; or temporarily duplicate it. | Depend on the reviewed phase-5 service and extend its implementation with explicit output consumption, live raw signalling observation, stdin and reaping. `TranscriptionProcess.start` returns the extended run and names its scope owner. Reconcile actual merged names before implementation; this `main` does not yet contain that implementation. |
| **Compatibility worker lifetime at phase 10** | Keep a residual unported worker shim; or resolve native JSON/output/timer gaps before removing the sibling. | Resolve them before deletion. A residual unported shim contradicts phase-10 completion; record these as cutover blockers with tests and an owner. |
| **Stored result-kind strings** | Keep arbitrary stored strings readable; or introduce a new semantic rejection after db decoding. | Preserve reads through `StoredTranscriptRecord`/`StoredTranscriptHead` with `S.String`. Keep the produced-result kit and old legacy declarations separately. No additional rejection or section-9 exception. |
| **Provider-probe measurement** | Time the whole recognition operation; or add a driver operation with the old internal measurement boundary. | Add `RecognizerSession.probe`. Keep clock reads immediately around synchronous decode, optional `inputFinished` before timing, result reading after timing, and existing warmup/measured orchestration. |
| **Runtime probe-cache root shape** | Require a record and introduce a new recovery policy; or decode JSON to unknown and preserve lookup/spread. | Decode to unknown. Preserve arrays/primitives, inherited/boxed lookup, null lookup failure and null spread; read/syntax errors alone supply `{}`. |
| **Native caption timeout scope** | Let each capture close its process scope; or let a longer-lived owner reap independently of caller completion. | `CaptionProcessOwner` owns capture child scopes and late observers. Timeout requests child TERM and publishes failure without scope closure/reap. Eventual completion closes the child scope; composition-root shutdown closes the owner and retains stock waiting behavior. Compatibility gains no new finalizer or escalation. |

## 13. Review

Reviewer: an independent session on the review-panel tier, read-only, on 2026-11-18. It read the plan, port guide, rule set, draft, source inventory, precedents, package, consumers and installed libraries, and ran in-memory probes. Three major findings, one minor finding, two questions; no blocker:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | major | The shared process extension omitted intentionally unread pipes, live `child.killed` and an acquisition operation returning stdin/reaping capabilities. | Sections 5–6 declare `TranscriptionProcess.start`, explicit per-output consumption, live raw signalling state and `WorkerProcessRun`; section 10 requires unread-pipe backpressure and cancellation-before-heartbeat characterization while keeping signal acknowledgement separate from exit. |
| 2 | major | A literal result-kind decoder would reject stored strings accepted by the db model and returned unchanged by the old store. | Sections 3 and 6 use wider stored full/head read schemas with `S.String`, retain produced-result and legacy declarations separately, and preserve unknown stored strings; section 9 excludes this rejection and section 10 pins every full/head read path. |
| 3 | major | A waveform-to-result decode contract erased the decode-only timing boundary and probe-specific `inputFinished` call used for provider selection. | Section 5 adds `RecognizerSession.probe` with internal clock reads, exact call order and separate warmup/measured runs; section 6 corrects the clock mapping and section 10 adds fake-addon trace and 0.95-threshold-sensitive tests. |
| 4 | minor | An open-record probe-cache schema still rejected valid JSON roots that the existing lookup/spread code accepts. | Sections 3, 4, 6 and 9 retain JSON-unknown roots, JavaScript lookup/spread and null lookup TypeError; section 10 characterizes arrays, primitives, objects, null and read/syntax fallback. |
| 5 | question | A native capture’s scope finalizer could wait for a TERM-ignoring child and delay the promised immediate timeout result. | Section 6 identifies today’s TERM-then-reject sequence and gives native captures a layer-owned reaping scope that survives caller completion; eventual cleanup and shutdown are explicit, and section 10 requires a TERM-ignoring native test. |
| 6 | question | Supplying model files did not explain or assert how the packaged real-ASR baseline selects CPU. | Sections 10 and 12 specify the existing GPU-disabled harness mechanism, require the app’s public `compute.provider=cpu` report for every accepted run, and require the baseline and all later runs to use the same complete model set identified by report-recorded file checksums. |

The reviewer found sound the consumer accounting and package split; borrowed database ownership, transaction/query shapes, memory references, shared partial state and cleanup ordering; the installed sherpa, OpenCC and Effect API observations; and the distinction between offline contract proof, real-ASR prerequisites and remote-service proof.

## 14. Still open

No additional application behavior change is selected by this revision. Section 9 is the complete list of deliberate changes for phase 6c.

The recorded native cutover decisions still require evidence where section 12 makes the choice conditional:

| Question | Options and required evidence | Current boundary |
| --- | --- | --- |
| Native sherpa result repair | Prove raw addon result access, subpath resolution, handle typing and the exact repair predicate; otherwise retain a separately supplied result-reader capability. | Compatibility keeps the existing synchronous patch. Resolve before deleting the sibling. |
| Native worker output | Prove awaited `Stdio` output preserves watchdog/throughput behavior and review every new suspension; otherwise retain an explicit blocking-output capability with an acceptable strict owner. | Compatibility keeps blocking writes and retries. No application backpressure change is accepted here. |
| Caption escalation or bounded shutdown | Keep today’s immediate timeout and potentially surviving child, or deliberately introduce a grace period/KILL or bounded owner shutdown. | This phase keeps today’s compatibility policy and the native owner’s explicit waiting shutdown. Escalation is not forced by the plan and requires a separate decision before application cutover. |
| Remaining native process differences | Preserve compatibility until unread-pipe buffering, raw observation loss, scheduling, cleanup and timer-reference differences are removed or individually declared. | Native tests record the differences now; phase 9.3 owns the application-layer decision. |