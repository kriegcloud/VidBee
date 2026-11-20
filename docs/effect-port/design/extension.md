# Design: `vidbee-extension` (phase 8)

Status: reviewed, findings resolved (section 13).

Inputs: the port plan’s locked decisions, assumptions, standard, phase gates and amendments; the complete port guide; the repository TypeScript configuration and port checker; the source inventory; the independent review; the db and downloader-core designs; the task-queue design and the phase 4 packages; current extension and desktop API source; installed Effect and WXT sources; the reference browser-platform and React atom packages; the settled desktop foundation’s atom and runtime conventions; and the packaged golden harness.

Source snapshot: `main` at `9dab889`, with a clean working tree. This document records read-only source inspection and narrow in-memory and synthetic producer probes. It does not claim an implementation, strict compilation, extension build, browser launch or packaged acceptance run.

Paths are repository-relative unless prefixed with `~`. **B** means `apps/extension/entrypoints/background.ts`; **P** means `apps/extension/entrypoints/popup/App.tsx`. Line references identify inspected source, not proposed files. The named downloader-core worktree is no longer present; its reviewed design is available at `docs/effect-port/design/downloader-core.md`.

## 1. What the package is, and what makes its port risky

A WXT browser extension with a background worker and React popup. It reads the active tab, asks the desktop application’s loopback API for metadata, persists the result in browser local storage, and displays format summaries. Downloads are handed to the desktop through `vidbee://download`; the extension does not download media itself.

The executable application source comprises the 219-line background worker, 503-line popup and 13-line popup bootstrap. There is no content script, database client, subprocess, filesystem API or workspace-package import. The package is private and has no export map (`apps/extension/package.json:1–28`). There is no existing `apps/extension/test` directory.

Six properties determine the design:

1. **The background listener does not answer the message.** It starts work and returns `undefined` synchronously. Storage changes carry completion to the popup (`B:212–219`). Returning a Promise or `true` would change the messaging contract and potentially worker lifetime.
2. **The contexts own separate state.** The background owns URL deduplication. Each popup document owns its presentation state, initialization attempts and storage listener. Their communication crosses browser APIs.
3. **Discovery and token acceptance are permissive.** Any successful HTTP status ends discovery, regardless of JSON shape or `ok`. JSON body failures become `null`. Token acquisition checks the truthiness of `.token` (`B:68–140`).
4. **The deadline covers response acquisition and body consumption.** The old timer remains active through JSON reading and status handling (`B:73–103`). Applying a timeout only to `HttpClient.execute` would shorten the protected operation.
5. **Several orderings are externally observable.** Pending storage precedes the first desktop request. Icon calls start without being awaited. The popup registers its storage listener before querying the tab. The first successful status probe ends scanning, and token failure does not restart it.
6. **Persistence uses unsynchronized whole-map replacement.** Different URLs can overwrite one another’s changes. The background TTL is five minutes and the popup TTL is one hour. This phase preserves those rules.

A2 applies to observations at the application boundaries: HTTP requests and deadlines, browser storage writes and their order relative to requests, icon calls, runtime messages and listener return values, rendered output, and navigation URIs. Internal Promise adoption and microtask positions are not contracts for this application. There is no unported JavaScript sharing these execution contexts.

## 2. Shape of the port

`apps/extension`, package name `vidbee-extension`, becomes strict as one application unit. It contains its schemas, synchronous calculations, Effect services, browser drivers, background orchestration, popup controller, atoms, React rendering and composition roots.

There is no compatibility sibling. D9’s temporary facades serve unported consumers of ported packages. Nothing imports this application, and no such consumer requires an old Promise interface. The phase 4 and downloader-core sibling arrangements remain precedents for imported packages, not a reason to add an unused extension facade.

Existing filenames remain. New companions follow D21: `Extension.model.ts`, `Extension.errors.ts`, `ExtensionBrowser.service.ts`, `ExtensionBrowser.driver.ts`, `ExtensionBrowser.layer.ts`, `ExtensionHttp.service.ts`, `ExtensionHttp.layer.ts`, `ExtensionCache.service.ts`, `ExtensionCache.layer.ts`, `ExtensionBackground.service.ts`, `ExtensionBackground.layer.ts`, `ExtensionNavigation.service.ts`, `ExtensionNavigation.driver.ts`, `PopupController.service.ts`, `PopupController.layer.ts`, and `Popup.atoms.ts`. Shared application companions can live under `apps/extension/src/`; popup-specific companions can live beside `App.tsx`.

### Entry dispositions and consumers

| Existing entry | Result |
| --- | --- |
| `entrypoints/background.ts` | Remains WXT’s background definition. Its thin registration calls the composition function exported by `src/Background.entry.ts`. Background commands remain Effect-native application logic. |
| `entrypoints/popup/App.tsx` | Remains the default synchronous React component, rendering existing markup from independent atoms. |
| `entrypoints/popup/main.tsx` | Remains the popup composition root. It owns document startup, browser runtime entry, registry injection, the lifecycle adapter and React mounting. |
| `entrypoints/popup/index.html` | Keeps its title, document attributes, root element and module script. |
| `wxt.config.ts` | Keeps the React module, public manifest key, permissions, locale references and build ownership. |

There are zero existing package export entries and zero external consumer imports to migrate. The popup bootstrap’s local `App` import remains. New internal imports do not count as migrated consumers.

WXT 0.21.5 accepts both `background.ts` and `background/index.ts` (`node_modules/wxt/dist/internal/entrypoint-finders/flat.mjs:25–26`). Keeping `background.ts` and adding `src/Background.entry.ts` satisfies D21 and the checker without changing discovery.

`background.ts` itself is not a permitted runtime filename. `src/Background.entry.ts` and `entrypoints/popup/main.tsx` are permitted by the exact filename rule in `scripts/port-check.mjs:52–56`. Runtime creation and execution stay there. No checker change, alias or exemption is proposed.

### WXT and strict TypeScript

Ordered inheritance is selected, subject to an option-by-option comparison after WXT preparation. The implementation inspects the resolved configuration with the installed compiler and compares it with the repository base and generated WXT configuration.

The comparison includes the complete Effect plugin object, every diagnostic severity, empty overrides, `types: []`, strictness, target, declaration options, output paths, generated aliases and generated declaration inclusion. A successful compiler invocation alone is not evidence that all inherited diagnostics survived.

The source configuration is:

```json
{
  "extends": ["./.wxt/tsconfig.json", "../../tsconfig.base.json"],
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "rootDir": ".",
    "noEmit": false
  },
  "include": [
    "entrypoints/**/*.ts",
    "entrypoints/**/*.tsx",
    "src/**/*.ts",
    "src/**/*.tsx",
    "wxt.config.ts",
    ".wxt/wxt.d.ts"
  ],
  "exclude": ["test", ".output", "dist", "node_modules"]
}
```

The repository base comes last. A8 authorizes the module and resolution changes. DOM libraries are necessary for this browser application. `rootDir` covers the existing application layout. `noEmit: false` cancels WXT’s generated `noEmit: true` so the strict check can emit declarations.

The explicit include restores the application graph after the base’s `include: []`. `.wxt/wxt.d.ts` retains WXT’s generated references, including Vite builder types, React module types, aliases, globals and auto-import declarations. Generated path aliases remain inherited unless the configuration comparison demonstrates otherwise.

The test configuration is:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": false,
    "incremental": false,
    "declaration": false,
    "declarationMap": false,
    "noEmit": true
  },
  "include": [
    "entrypoints/**/*.ts",
    "entrypoints/**/*.tsx",
    "src/**/*.ts",
    "src/**/*.tsx",
    "test/**/*.ts",
    "test/**/*.tsx",
    "wxt.config.ts",
    ".wxt/wxt.d.ts"
  ],
  "exclude": [".output", "dist", "node_modules"]
}
```

If ordered inheritance fails the comparison, the fallback extends only `../../tsconfig.base.json` and explicitly supplies the generated WXT configuration’s necessary browser options, aliases and ambient declaration inclusion. The implementation derives those values from the generated configuration and verifies them after preparation. It does not copy the Effect diagnostic matrix into an application override, edit `.wxt` by hand, or weaken the base.

The generated options are defined in `node_modules/wxt/dist/internal/generate-wxt-dir.mjs:163–201`. The base’s target remains `ES2025`; WXT’s generated `ESNext` target does not override it. The fallback is a configuration compatibility path, not permission to accept fewer diagnostics.

## 3. Schemas

Schemas precede service contracts. Application-defined literal unions use `LiteralKit` from `@vidbee/schema/LiteralKit`. Effect schemas come from `effect/Schema`.

Three contracts remain separate:

1. Normal output after vendored yt-dlp processing.
2. Arbitrary parsed output the desktop’s unchecked path could forward.
3. Values already persisted in browser storage.

The extension’s accepted metadata is a fourth, explicit policy: require an object root, decode each modeled field independently, and treat null or wrong-kind modeled values as absent. A malformed field does not reject an otherwise object-shaped response.

### The actual desktop metadata path

The `/video-info` route calls `downloadEngine.getVideoInfo` and projects four properties (`apps/desktop/src/main/local-api.ts:563–569`).

```text
local-api.ts
  → download-facade.ts:getVideoInfo
  → yt-dlp-info.ts:fetchVideoInfo
  → execVideoInfo
  → parseVideoInfoPayload
  → JSON.parse(stdout) as VideoInfo
```

Evidence:

- `apps/desktop/src/main/lib/download-facade.ts:86` imports `fetchVideoInfo` from `./yt-dlp-info`.
- `download-facade.ts:429–431` forwards directly to that function.
- `yt-dlp-info.ts:46–58` parses JSON and casts it.
- `yt-dlp-info.ts:72–82` inflates estimated sizes and returns the parsed value.
- `yt-dlp-info.ts:99–108` invokes that path.

The desktop’s `VideoInfo` and `VideoFormat` declarations use snake-case yt-dlp fields (`apps/desktop/src/shared/types/index.ts:32–61`).

Downloader-core’s strict metadata model is a different path. `packages/downloader-core/src/MediaInfo.model.ts:5–36` requires string `formatId`, string `ext`, string `title`, finite optional numbers and an array of formats. `CoreMetadata.model.ts:22–75` normalizes yt-dlp fields and decodes that model. It produces camel-case fields such as `formatId`, `filesizeApprox` and `formatNote`.

The loopback route does not call that decoder. Importing or deriving the extension’s wire schema from `MediaInfo.model.ts` would describe the wrong response.

### Contract 1: normal vendored yt-dlp output

“Normal output” here means the processed result emitted by the vendored producer, including its normalization. It does not mean arbitrary extractor input satisfies every advertised field type.

| Field or structure | Producer evidence and limit |
| --- | --- |
| Root | `process_video_result` operates on an information dictionary; JSON output passes through `sanitize_info` (`vendor/yt-dlp/yt_dlp/YoutubeDL.py:2836`, `:3285`, `:3741–3776`). |
| `title` | `_fill_common_fields` supplies a generated string for a falsy title; it does not generally convert every truthy title to a string (`YoutubeDL.py:2774–2783`). A blanket claim that all wrong kinds are eliminated is unsupported. |
| `thumbnail` | Thumbnail handling selects a thumbnail URL and applies `sanitize_url` to a truthy selected value (`YoutubeDL.py:2735–2769`, `:2891–2898`). This is executable URL handling, not the desktop’s unchecked projection. |
| `duration` | Included in `_NUMERIC_FIELDS`; non-null values outside Python `int`/`float` are converted with `int_or_none` (`YoutubeDL.py:599–608`, `:2857–2867`). Python booleans satisfy that numeric test. |
| `format_id` | A non-null non-string is converted with `str`; missing or falsy IDs receive a string index, and existing IDs are sanitized as strings (`YoutubeDL.py:2850–2855`, `:2965–2967`, `:2999–3006`). Numeric `format_id=7` becomes `"7"`. |
| `width`, `height`, `fps`, `filesize`, `filesize_approx`, `tbr` | Included in `_NUMERIC_FIELDS`, normalized for each format. Booleans pass the numeric kind check; later calculations can also derive or replace values (`YoutubeDL.py:599–608`, `:2967`, `:2979–2982`; `vendor/yt-dlp/yt_dlp/utils/_utils.py:5622–5653`). |
| `ext` | A missing or falsy extension is derived from the URL. There is no general string conversion here for a truthy extension (`_utils.py:5622–5634`). |
| `resolution` | A null or absent value is computed by `format_resolution`; this branch does not validate every already-present value (`YoutubeDL.py:2974–2975`). |
| `format_note`, `vcodec`, `acodec` | Used or preserved by format processing; they do not receive the `format_id` string conversion. Later codec and sorting operations constrain which malformed inputs complete successfully. |
| `formats` and elements | Processing obtains formats, reads dictionary properties, filters malformed URLs and iterates format dictionaries. Successful normal output is not evidence for arbitrary scalar or null format entries (`YoutubeDL.py:2917–2967`). |
| Nulls and JSON kinds | `sanitize_info` recursively preserves JSON scalars, including booleans; optional removal of private/null values depends on its argument. It is not a semantic metadata validator (`YoutubeDL.py:3741–3776`). |

A no-network synthetic call to the actual vendored `process_video_result(download=False)` followed by `sanitize_info` confirms:

```json
{
  "duration": true,
  "format_id": "7"
}
```

This establishes that boolean duration survives this producer path and numeric format IDs are normalized. It does not establish that a particular real extractor returns boolean duration.

The acceptance table below therefore marks numeric booleans as producer-reachable in principle. Wrong-kind strings, arrays and objects in numeric fields are subject to the producer’s numeric conversion; they are not forwarded unchanged by that conversion. For the other string-like fields, the table identifies the actual transformation rather than asserting an exhaustive guarantee that all malformed extractor values either survive or fail.

### Contract 2: arbitrary parsed output the desktop could forward

`writeJson` uses `JSON.stringify` (`apps/desktop/src/main/local-api.ts:77–82`). The route emits:

```ts
{
  title: info.title,
  thumbnail: info.thumbnail,
  duration: info.duration,
  formats: info.formats ?? []
}
```

| Field | Unchecked desktop serialization rule |
| --- | --- |
| `title` | An absent property is omitted. Explicit null and other JSON kinds pass through if the preceding path completes. |
| `thumbnail` | The same unchecked projection. |
| `duration` | The same unchecked projection. A non-finite JavaScript number serializes as null. |
| `formats` | Always present in a successful serialized response. Missing or null source `formats` becomes `[]`; another non-null kind passes through. |
| Format elements | Forwarded without projection or semantic decoding. |
| Format properties | Forwarded without extension-field validation, including extra properties. |
| Additional top-level metadata | Omitted by the four-field projection. |

`inflateEstimatedSizes` is a qualification: when `formats` is an array and `duration` is truthy and positive, it reads each format and may write `filesize_approx` (`yt-dlp-info.ts:29–43`). A null element can fail there and lead to HTTP 500. With a falsy or non-positive duration, that loop is skipped. This does not establish that every successfully forwarded array contains only objects.

Numeric format IDs are possible on this unchecked path if arbitrary parsed data supplies them; they are not a demonstrated normal vendored-output case.

The route’s successful projection is object-shaped even when unchecked source metadata has unusual fields. The extension also has an HTTP boundary independent of that route: non-object successful response roots are rejected with `Invalid video info.`. There is no claim that the unchanged route normally emits such a root.

### Contract 3: historical browser storage

Browser storage is not a fresh desktop response. It may contain old extension entries, partial values or malformed values. The map is a plain record of unknown values; unrelated entries are retained literally.

Only the selected entry is semantically decoded. Its required fields are string `url`, the known status discriminator, and finite numeric `fetchedAt`. Optional `info` and `error` are not conditionally required by status.

Stored `info`, when present, must match the modeled metadata schema. A selected entry whose stored fields do not decode is a miss; the read leaves its original value untouched. HTTP field normalization is not a migration that rewrites historical storage.

### Modeled metadata and declarations

The closed modeled schemas are:

```ts
import { LiteralKit } from "@vidbee/schema/LiteralKit"
import * as S from "effect/Schema"

export const CacheStatus = LiteralKit(["pending", "ready", "error"])
export type CacheStatus = typeof CacheStatus.Type

export const VideoFormat = S.Struct({
  format_id: S.optional(S.String),
  ext: S.optional(S.String),
  format_note: S.optional(S.String),
  resolution: S.optional(S.String),
  width: S.optional(S.Finite),
  height: S.optional(S.Finite),
  fps: S.optional(S.Finite),
  vcodec: S.optional(S.String),
  acodec: S.optional(S.String),
  filesize: S.optional(S.Finite),
  filesize_approx: S.optional(S.Finite),
  tbr: S.optional(S.Finite)
})
export type VideoFormat = typeof VideoFormat.Type

export const VideoInfo = S.Struct({
  title: S.optional(S.String),
  thumbnail: S.optional(S.String),
  duration: S.optional(S.Finite),
  formats: S.optional(S.Array(VideoFormat))
})
export type VideoInfo = typeof VideoInfo.Type

export const VideoInfoCacheEntry = S.Struct({
  url: S.String,
  status: CacheStatus,
  fetchedAt: S.Finite,
  info: S.optional(VideoInfo),
  error: S.optional(S.String)
})
export type VideoInfoCacheEntry = typeof VideoInfoCacheEntry.Type

export const CacheMap = S.Record(S.String, S.Unknown)
export type CacheMap = typeof CacheMap.Type

export const PruningTimestamp = S.Struct({
  fetchedAt: S.Finite
})

export const VideoGroup = S.Struct({
  label: S.String,
  height: S.Finite,
  formats: S.Array(VideoFormat)
})
export type VideoGroup = typeof VideoGroup.Type
```

No positive, integer, URL, dimension, duration or filesize refinement is added. Negative and fractional finite numbers remain valid. Metadata objects remain structural values; this application has no mutable in-process legacy API to preserve.

The response decoder has this contract:

```ts
export declare const decodeVideoInfoResponse: (
  value: unknown
) => Effect.Effect<VideoInfo, ExtensionBoundaryFailure>
```

It performs these steps:

1. Require a non-null, non-array object root.
2. Decode each modeled string property with `S.String` independently and each modeled numeric property with `S.Finite` independently.
3. Omit a property when its value is absent, null or fails that field’s decoder. Do not coerce it.
4. If `formats` is an array, retain only non-null, non-array object elements and independently decode their modeled properties by the same rules.
5. If `formats` is absent, null or not an array, omit it.
6. Decode the resulting projection with the closed `VideoInfo` schema.

An object format whose fields are all absent remains `{}` and still contributes to the format count. A discarded non-object element does not.

Use `S.decodeUnknownEffect` for failure-producing boundary decoding and `S.decodeUnknownOption` for independent optional observations. Both exist in the installed `node_modules/effect/src/Schema.ts:1536`, `:1673`. No `S.StructWithRest` is used.

Only a rejected response root produces the metadata boundary failure, mapped to the stored message `Invalid video info.`. Null or wrong-kind modeled fields do not produce that error. Closed decoding discards unknown response and format fields.

### Per-field old rendering versus new rendering

The table concerns the HTTP response path. A field substitution is made independently while surrounding fields remain well formed. Where classification or fallback depends on another field, the dependency is stated. Historical entry decoding remains the separate contract above.

“Absent” means the new projection omits the substituted field. It does not write null, zero or an empty string.

The old expressions are the exact rendering rules at `P:35–71`, `:223–288`, `:430–489`. They also define results for values with multiple possible array/object contents; representative cases do not replace those expressions.

| Field | Old result for null | Old result for each wrong kind | New result for null and every wrong kind |
| --- | --- | --- | --- |
| `title` | `Untitled video` | Boolean false and number zero use the fallback; true renders no title text; a nonzero number renders as text. Arrays are React children, so renderable elements render in order; an object child fails rendering. | Absent: `Untitled video`. |
| `thumbnail` | No image | False: no image. True: an image element with its boolean `src` removed by React DOM. Zero: the guarded expression renders `0`; a nonzero number produces an image with a coerced `src`. Arrays and objects are truthy and reach the image `src` coercion. | Absent: no image and no guarded-expression `0`. |
| `duration` | `Unknown` | False: `Unknown`; true: `0:01`. Empty string, `"0"` and a negative numeric string: `Unknown`; positive numeric strings are rounded and formatted; a nonnumeric string produces `NaN:NaN`. Arrays/objects follow the same comparison and numeric-coercion expressions; `[]` gives `Unknown`, `[60]` gives `1:00`, `{}` gives `NaN:NaN`. | Absent: `Unknown`. |
| `formats` | `[]`, count zero and `No compatible formats.` | Strings are iterable: the old loop visits characters, counts string length and classifies ordinary characters as Other; an empty string gives count zero. Booleans, numbers and ordinary objects fail the `for…of` iteration. | Absent: `[]`, count zero and `No compatible formats.` |
| A format element | Null fails property access | Boolean, number and string elements ordinarily contribute to count but classify as Other; array elements are also retained and classified through their properties. | Non-object elements, including arrays, are dropped; retained object count and classification follow the decoded fields. |
| `format_id` | Visible row uses `-`; key falls through through `??` | False and zero display `-`; true displays no text; nonzero numbers display as text. Arrays render their React children in the cell; ordinary object children fail. Key interpolation can also change the key. | Absent: visible row uses `-`; key uses `ext` or the existing final fallback. |
| `ext` | Visible row uses `-`; key can fall through | The same boolean, number, array and object cell behavior as `format_id`; `ext` is also the second key fallback. | Absent: visible row uses `-`; key uses the existing final fallback when no ID exists. |
| `format_note` | No rendered effect | Boolean, number, array or object has no rendered effect; the popup does not use this field. | Absent; no rendered effect. |
| `resolution` | No resolution classification signal or regex fallback | False and zero supply no truthy classification signal; true, nonzero numbers, arrays and objects supply one. If grouping reaches `resolution?.match` with a non-null non-string and no truthy height, it fails because `.match` is not callable. | Absent: no resolution classification signal or regex fallback. |
| `width` | No width classification signal | False, zero and empty string supply no signal. True, nonzero numbers of the wrong modeled kind are inapplicable here; nonempty strings, arrays and objects are truthy and can classify the format as video. Width does not set the group height. | Absent: no width classification signal. |
| `height` | No height classification signal; resolution can supply the group | False, empty string and `"0"` do not produce a positive group, though `"0"` is a truthy video signal. True can produce group `1p`; positive numeric strings produce their numeric group; nonnumeric strings and ordinary objects become no-height video formats. Arrays use `Number(h)`, for example `[720]` gives `720p` and `[]` gives Other. | Absent: no height signal; valid resolution can still determine the group. |
| `fps` | No rendered effect | Boolean, string, array or object has no rendered effect; the popup does not use it. | Absent; no rendered effect. |
| `vcodec` | No codec video signal; dimensions/resolution can still classify video | False and zero supply no codec signal. True, nonzero numbers, arrays and objects are truthy and differ from `"none"`, so classify as video. | Absent: classification uses resolution/dimensions. |
| `acodec` | No audio codec signal | False and zero supply no signal. True, nonzero numbers, arrays and objects can classify as audio when video classification is false. | Absent: no audio codec signal. |
| `filesize` | Uses `filesize_approx`, then `-` | False and empty string use the approximate fallback. True reaches `toFixed` and fails. Strings are passed through the old comparison/division loop: `"1024"` becomes `1.0 KB`, while `"1"` reaches string `.toFixed` and fails. Arrays/objects follow that same loop: `[]` gives `-`, `[1024]` becomes `1.0 KB`, and `{}` fails. Truthy values also affect descending size sorting through subtraction. | Absent: uses valid `filesize_approx`, then `-`; sorting uses the remaining valid size or zero. |
| `filesize_approx` | `-` when no truthy `filesize` exists | The same boolean, string, array and object formatting behavior as `filesize`, but only when the primary filesize is falsy; sorting uses the same fallback order. | Absent: uses valid `filesize`, otherwise `-`; sorting uses the remaining valid size or zero. |
| `tbr` | No rendered effect | Boolean, string, array or object has no direct rendered effect; the popup does not use it. | Absent; no rendered effect. |

Numbers are valid for numeric fields, and strings are valid for string fields; those kinds are not rejected merely because a value is negative, fractional or empty. Non-finite numeric values fail `S.Finite` and become absent. HTTP JSON cannot directly represent NaN or infinity, but storage and the pure oracle exercise them.

The producer reachability of these cases follows contract 1:

- Null or absent optional numeric fields are possible; the extension treats both as absent.
- Boolean numeric fields can survive the vendored numeric sanitizer. Boolean duration is confirmed by the synthetic producer probe. Its old `0:01` versus new `Unknown` result is a declared change.
- Numeric `format_id` does not survive as a number through normal producer normalization; it becomes a string and remains accepted.
- Wrong-kind numeric strings, arrays and objects do not pass the numeric sanitizer unchanged.
- A null/falsy title is replaced by the producer’s generated title before this desktop route.
- Normal format processing does not establish scalar `formats` or non-object format entries as successful producer output.
- The remaining string-like fields have the specific producer operations listed above. The design does not claim that every malformed value in those fields is either normally emitted or unreachable.

The per-field differential oracle proves equality where the old renderer already treated a value as empty. Every unequal rendered result, changed count/key/group/order, or old rendering failure replaced by a rendered result is covered by section 9.

### Permissive boundaries

| Boundary | Retained acceptance |
| --- | --- |
| Incoming runtime message | Read the command discriminator and URL truthiness. Do not add a supported-site, sender-origin or URL grammar check. |
| Browser sender | Consume `sender.tab?.id`; retain the truthy-tab-ID icon rule. |
| `/status` | Any 2xx response qualifies after the JSON attempt. The body is an unknown observation; `{ ok: true }` is not required. |
| `/token` | Preserve property access, truthiness and URI encoding. A truthy value is not rejected merely because it is not a string. |
| HTTP failure body | For an object-like body, consume unknown-valued `error` and `details`; retain truthy filtering and string coercion. |
| Browser storage | Read a plain record through `S.Record(S.String, S.Unknown)`. Decode only a selected entry or pruning timestamp projection. |
| Storage notification | Preserve the local-area and truthy-new-value guards, then decode the root and selected URL entry. |
| Locale resource | Validate the shipped message shape in tests. Do not introduce runtime localization. |

`S.Unknown` documents an intentionally permissive observation. It is not cast to a semantic metadata type.

### Storage preservation

The storage key remains `videoInfoCacheByUrl`.

An absent storage key means no map: the background begins with an empty map and the popup has a cache miss. A present root must be a plain record. A scalar, null or array root fails decoding; it is not replaced with an empty record and is not rewritten. Background and popup read failures are logged fiber failures at the read boundary.

Each map value stays unknown until consumed. A selected entry that fails decoding is a cache miss and is left untouched by the read.

Pruning decodes only a finite numeric `fetchedAt` projection. It deletes entries whose decoded timestamp satisfies:

```text
now - fetchedAt > 5 * 60 * 1000
```

Missing or undecodable timestamps remain. The current arithmetic already retains an object with a missing timestamp because subtraction produces NaN, and `NaN > CACHE_TTL_MS` is false (`B:152–157`). The new rule also retains malformed entries that today could throw or be coerced into a removable timestamp; section 9 declares those cases.

Unrelated values are written back unchanged. Reading a decoded view does not replace the original stored object with that view. A fresh ready cache hit performs no write.

A save reads the map, prunes eligible timestamps, replaces the current URL entry and writes the entire map. There is no lock, merge-on-write, migration or background eviction timer.

## 4. Errors

There are no extension-defined error classes today. Request failures usually become stored strings before the popup sees them.

New errors are schema-backed tagged errors in `Extension.errors.ts`:

```ts
export class ExtensionHostFailure extends S.TaggedError<ExtensionHostFailure>()(
  "ExtensionHostFailure",
  {
    operation: S.String,
    cause: S.Defect()
  }
) {}

export class ExtensionRequestFailure extends S.TaggedError<ExtensionRequestFailure>()(
  "ExtensionRequestFailure",
  {
    message: S.String,
    status: S.optional(S.Finite)
  }
) {}

export class ExtensionBoundaryFailure extends S.TaggedError<ExtensionBoundaryFailure>()(
  "ExtensionBoundaryFailure",
  {
    boundary: S.String,
    issue: S.String
  }
) {}

export type ExtensionError =
  | ExtensionHostFailure
  | ExtensionRequestFailure
  | ExtensionBoundaryFailure
```

Diagnostics exclude tokens, URL keys, titles, thumbnails and stored content. Full Causes retain the error structure; host and decoder adapters sanitize sensitive text before constructing logged errors.

| Origin | Retained application behavior |
| --- | --- |
| Non-2xx HTTP response | Truthy `error` and `details` joined with `"\n\n"`, otherwise `Request failed: <status>` (`B:83–88`). |
| Fetch transport failure | Inspect the original transport cause rather than exposing Effect’s wrapper text. Preserve `VidBeep app not responding on this port.` for the existing `Failed to fetch` condition. |
| Scan exhaustion | `VidBeep app not found on localhost.` |
| Falsy token | `Failed to acquire token from VidBeep.` |
| Null token body | Fails at token consumption; do not convert it into a successful empty token observation. Exact engine-error text is not recreated. |
| Non-object metadata response root | Store `Invalid video info.` through the request-error path. |
| Null or wrong-kind modeled metadata field | Omit that field; continue decoding the response. |
| Request or ready-save failure | Store the application message, or `Failed to fetch video info.` for the existing non-Error fallback. |
| Initial cache read or pending write | Fail outside the request catch. Log the failed fiber; write no error entry. |
| Error-entry write failure | Log the failed fiber. Do not start the default icon call after the failed write. |
| Icon failure | Log its separate fiber. Do not delay or fail metadata work. |
| Invalid active tab | Render `Please open a valid video page first.` |
| `sendMessage` failure | Set the sanitized message or `Failed to request video info.`, then still perform the final cache read. |
| Popup initialization read/query failure | End that initialization fiber and log the cause. Do not invent an error-state transition absent from the old code. |
| Malformed storage notification root | Fail and log that notification fiber; do not substitute data, rewrite storage or invent a presentation transition. |
| Navigation assignment failure | Retain failure at the navigation operation; do not increment retry after a failed launch assignment. |

`sanitizeError` remains exact: case-insensitive matching of `localhost`, `fetch`, `network`, `connect` or `failed to request` produces `Client connection failed`; otherwise it returns the original string (`P:103–115`).

The old abort-reason object is not modeled or emulated. Timeout handling retains the request/body phase distinction and the observable application outcome established by characterization. A blanket rewrite of all deadlines to `Request timed out.` is not justified by the old implementation, which can receive the string abort reason and use its non-Error fallback.

Failure location remains material. Moving the initial cache read into the metadata catch, awaiting an icon operation, or returning a task from the message listener would change behavior.

## 5. Services

Services are `Context.Service` classes with deterministic package/file/service keys. Implementations are Layers. Promise adaptation of browser APIs appears only in `*.driver.ts`.

In the declarations below, data models come from section 3, browser observations retain only fields used by this application, and construction dependencies are supplied by Layers.

```ts
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export interface ActiveTab {
  readonly url?: string | undefined
}

export interface MessageSenderObservation {
  readonly tabId?: number | undefined
}

export interface StorageChangeObservation {
  readonly newValue?: unknown
}

export type StorageChanges =
  Readonly<Record<string, StorageChangeObservation>>

export type RemoveListener = () => void

export interface IconOptions {
  readonly path: Readonly<Record<number, string>>
  readonly tabId?: number | undefined
}

export class ExtensionBrowser extends Context.Service<
  ExtensionBrowser,
  {
    readonly origin: Effect.Effect<string, ExtensionHostFailure>
    readonly queryActiveTabs: Effect.Effect<
      readonly ActiveTab[],
      ExtensionHostFailure
    >
    readonly sendMessage: (
      command: { readonly type: "video-info:fetch"; readonly url: string }
    ) => Effect.Effect<void, ExtensionHostFailure>
    readonly readCacheRoot: Effect.Effect<unknown, ExtensionHostFailure>
    readonly writeCacheMap: (
      map: CacheMap
    ) => Effect.Effect<void, ExtensionHostFailure>
    readonly setIcon: (
      options: IconOptions
    ) => Effect.Effect<void, ExtensionHostFailure>
    readonly listenStorage: (
      listener: (changes: StorageChanges, areaName: string) => void
    ) => Effect.Effect<RemoveListener, ExtensionHostFailure>
    readonly listenMessages: (
      listener: (
        message: unknown,
        sender: MessageSenderObservation
      ) => undefined
    ) => Effect.Effect<RemoveListener, ExtensionHostFailure>
  }
>()("vidbee-extension/ExtensionBrowser.service/ExtensionBrowser") {}

export class ExtensionHttp extends Context.Service<
  ExtensionHttp,
  {
    readonly requestJson: (
      method: "GET" | "POST",
      url: string,
      deadlineMs: number
    ) => Effect.Effect<unknown, ExtensionRequestFailure>
  }
>()("vidbee-extension/ExtensionHttp.service/ExtensionHttp") {}

export class ExtensionCache extends Context.Service<
  ExtensionCache,
  {
    readonly readSelected: (
      url: string,
      ttlMs: number
    ) => Effect.Effect<VideoInfoCacheEntry | null, ExtensionError>
    readonly save: (
      entry: VideoInfoCacheEntry
    ) => Effect.Effect<void, ExtensionError>
  }
>()("vidbee-extension/ExtensionCache.service/ExtensionCache") {}

export class ExtensionBackground extends Context.Service<
  ExtensionBackground,
  {
    readonly fetchAndCache: (
      url: string,
      tabId?: number
    ) => Effect.Effect<void, ExtensionError>
  }
>()("vidbee-extension/ExtensionBackground.service/ExtensionBackground") {}

export class ExtensionNavigation extends Context.Service<
  ExtensionNavigation,
  {
    readonly assign: (
      uri: string
    ) => Effect.Effect<void, ExtensionHostFailure>
  }
>()("vidbee-extension/ExtensionNavigation.service/ExtensionNavigation") {}

export interface PopupSession {
  readonly release: Effect.Effect<void>
}

export class PopupController extends Context.Service<
  PopupController,
  {
    readonly beginSession: (
      retryTrigger: number
    ) => Effect.Effect<PopupSession, ExtensionHostFailure>
    readonly retry: Effect.Effect<void>
    readonly download: Effect.Effect<void, ExtensionHostFailure>
    readonly openClientAndRetry: Effect.Effect<void, ExtensionHostFailure>
  }
>()("vidbee-extension/PopupController.service/PopupController") {}
```

The command type above is the admitted internal command, not a stricter runtime-message ingress policy. The driver observes the existing discriminator and URL truthiness before producing it. The raw message remains unknown until that observation.

`readCacheRoot` preserves the distinction between an absent key and a present invalid root. `writeCacheMap` performs the existing whole-map storage write. Listener removal is synchronous; lifecycle adapters execute the captured removal at the cleanup position.

`ExtensionCache.readSelected` applies background pruning only for the background policy. Popup reads apply the one-hour selected-entry age check without background pruning. `save` always follows the background read/prune/replace/write sequence.

`beginSession` registers the listener synchronously, starts initialization in the document scope and returns a release operation. It does not wait for tab query, messaging or cache work. `retry` increments the retry atom; React lifecycle replay then releases the previous session and begins another.

Clock and sleep use Effect directly: `Clock.currentTimeMillis` and `Effect.sleep`. There is no `ExtensionTiming`, `LegacyTiming`, timer-turn service or legacy Promise runner.

### Background ownership and ordering

One background execution context owns one runtime, one scope and one URL registry. The registry uses Effect collections and refs, not native `Map` or `Set`.

An accepted message enters the background owner synchronously, starts or joins work, and returns `undefined` from the browser listener. The listener never returns the fiber.

Deduplication publishes the admitted URL before another command can start independent work for that URL. The first invocation owns the icon target. Duplicate messages do not update another tab’s icon.

The old placement of the first storage read before the internal pending registry is not itself a boundary contract. The port preserves the observable admission and storage-call trace for ordinary browser delivery without reproducing Promise adoption turns.

Registry cleanup uses Effect finalization installed before interruptible work. A child completing synchronously cannot leave a stale entry. JavaScript generator `try/finally` is not used to finalize yielded Effects.

The work sequence is:

1. Read and prune the cache in memory.
2. For a decoded fresh ready entry, start the success icon call and finish without writing.
3. Otherwise, start the loading icon call.
4. Await the pending-entry write.
5. Only then begin desktop discovery.
6. On metadata success, independently decode its fields, await the ready-entry write, then start the success icon call.
7. On request, response-root or ready-write failure, await the error-entry write, then start the default icon call.
8. Remove the URL registry entry on completion or failure.

Icon operations are forked into the background owner’s scope with immediate start. Their browser calls begin at the stated position, while their asynchronous completion is not awaited. Each icon fiber logs its own failure.

Initial-read and pending-write failures bypass step 7 exactly as today. Error-write failure prevents the default icon call exactly as today.

### Popup atoms and controller

Add `@effect/atom-react` at the reference pin `4.1.4`. Use `effect/reactivity/Atom` and `effect/reactivity/AtomRegistry` from Effect 4.1.4.

The state atoms retain independent initial values:

```text
info          null
error         null
loading       false
currentUrl    ""
retryTrigger  0
```

Do not replace them with one exclusive loading/error/ready union. A pending notification today changes only `loading`; stale info and error can remain stored behind the loading presentation.

The controller writes atoms through the document registry. `App` reads them with `useAtomValue`. Event callbacks use synchronous command adapters or `useAtomSet` in value mode. No component owns a Promise chain, fetch operation or asynchronous state machine.

The shared atom runtime factory follows the desktop foundation:

```ts
Atom.context({ memoMap: Layer.makeMemoMapUnsafe() })
```

The factory and controller use shared Layer values. One registry belongs to one popup document. The controller receives that registry; it does not create another registry to publish state.

Installed API evidence:

- `Atom.context` and `addGlobalLayer`: `node_modules/effect/src/reactivity/Atom.ts:840–936`.
- Runtime `.fn` accepts `{ concurrent?: boolean }`: `Atom.ts:771–806`.
- `AtomRegistry.mount`, `set` and `dispose`: `node_modules/effect/src/reactivity/AtomRegistry.ts:78–89`.
- `useAtomValue`, `useAtomMount`, `useAtomSet`: `~/YeeBois/projects/beep-effect/node_modules/@effect/atom-react/src/Hooks.ts:187`, `:317`, `:349`.
- Shared factory/provider precedent: `~/YeeBois/projects/beep-effect/apps/professional-desktop/src/runtime/ProfessionalAtomRuntime.ts:18–31` and `ProfessionalAtomProvider.tsx:10–50`.

A retry releases the previous storage-listener session and begins another. It does not cancel initialization, messaging, cache reads or launch delays already started. Those fibers belong to the popup document scope, not the listener-session scope or a replaceable action atom.

Action atoms dispatch short commands that fork into that document scope. Where a runtime function atom can receive overlapping commands, use its confirmed `concurrent: true` option. Do not rely on that option alone to preserve work after the action atom unmounts.

### Popup session ordering and StrictMode

For each session:

1. Install the storage listener.
2. Reset loading, error and info in the existing order.
3. Query `{ active: true, currentWindow: true }`.
4. Validate only the existing lowercase HTTP(S) prefix.
5. Set the session target URL and `currentUrl`.
6. Read popup cache.
7. Use ready/error cache only when `retryTrigger === 0`.
8. Otherwise send exactly `{ type: "video-info:fetch", url }`.
9. Perform the final cache read even after send failure.

Listener release marks that session inactive and removes its exact listener. It does not guard continuations of already-started initialization. Older work can still update atoms.

The lifecycle-only composition adapter is selected. It pairs controller session acquisition and release with React lifecycle, keyed by `retryTrigger`, inside the existing StrictMode tree. It contains no fetch logic, Promise chains or presentation state. `App` remains an atom renderer.

This preserves the current setup/cleanup/setup sequence from `P:124–221` and `entrypoints/popup/main.tsx:8–12`. Each setup registers a listener and starts an initialization; the intermediate cleanup immediately removes the first listener without canceling that initialization.

Atom mounting alone does not reproduce this sequence. The independent review’s probe mounted an atom with a finalizer, released it and immediately remounted it; only setup occurred until final release. The binding’s provider also delays registry disposal by 500 ms (`~/YeeBois/projects/beep-effect/node_modules/@effect/atom-react/src/RegistryContext.ts:78–119`). Neither atom retention nor registry disposal substitutes for immediate listener-session cleanup.

The document scope remains alive across StrictMode replay and retries. Document destruction closes all remaining sessions and work.

### Logging

Use `Effect.logError` with the full Cause at detached-work failure boundaries. Install an Effect Logger Layer in both contexts. `Logger.consoleStructured` is available without assuming a window document and is suitable for worker-console output; `Logger.layer` accepts the logger array (`node_modules/effect/src/Logger.ts:1107`, `:1195–1218`).

Provide `References.MinimumLogLevel` as `"All"` in executing contexts, following the desktop foundation convention. The extension does not import `electron-log` or send new logging messages to the desktop.

## 6. Side-effect surfaces

### Network requests

Every request carries the existing extension header value:

```text
X-VidBee-Extension: browser.runtime.getURL("").replace(/\/$/, "")
```

Browser-controlled Origin remains browser-controlled. No application code adds Authorization, Content-Type, a request body, credentials policy, cache policy or redirect policy.

| Request | URL and order | Deadline | Retained rule |
| --- | --- | ---: | --- |
| `GET /status` | Sequential `http://127.0.0.1:<port>/status`, ports 27100 through 27120 inclusive | 800 ms per attempt | Any 2xx ends discovery after the body attempt. Failure advances to the next port. |
| `POST /token` | `/token` on the selected port | 800 ms | Bodyless request; no retry and no resumption of scanning. |
| `GET /video-info` | `/video-info?url=<encodeURIComponent(targetUrl)>&token=<encodeURIComponent(token)>` | 60,000 ms | New token for each metadata request; no retry. |

Preserve complete URL construction, query order and `encodeURIComponent` output. Do not replace it with a form-style query builder that turns spaces into `+`.

Desktop route evidence is `apps/desktop/src/main/local-api.ts:520–600`:

- Token issuance requires a trusted extension caller and matching browser Origin.
- `/token` requires POST and can reject pending-handshake capacity.
- `/video-info` consumes the origin-bound token before validating the URL or running metadata.
- `/status` reports capabilities and extension-cookie connection state.
- Metadata acquisition does not itself establish the extension-cookie connection.

### Native HTTP implementation

Both contexts use `effect/http/FetchHttpClient.layer`.

Construct requests with `HttpClientRequest.get` or `.post` and `setHeader`, then execute through `HttpClient.HttpClient`. Supply `HttpClient.TracerPropagationEnabled` as false in the executing context. It defaults to true and otherwise adds tracing propagation headers (`node_modules/effect/src/http/HttpClient.ts:3037–3059`).

Do not apply:

- `filterStatusOk`;
- retry or rate-limiter middleware;
- explicit redirect middleware;
- an `acceptJson` header;
- custom raw-fetch transport;
- response-size limits.

Fetch retains browser-default redirect behavior. Effect’s internal URL object, lowercase header representation and absent-body options are not parity differences unless they change the request observed by the server.

Read `response.json` once, recovering ordinary body-read or JSON-parse failure to null, before inspecting status. The installed accessor is an Effect (`node_modules/effect/src/http/HttpIncomingMessage.ts:66`; `HttpClientResponse.ts:437–450`).

An outer `Effect.timeoutOrElse` encloses acquisition, body reading and status handling. The request is scoped with `HttpClient.withScope`, so interruption or completion releases its resources. `HttpClient.timeout` alone is insufficient because later body reads would sit outside its budget.

Retain whether headers have arrived. A deadline during the body phase follows the existing null-body branch using the observed response status; it is not automatically an acquisition error. A deadline before headers follows the characterized request-failure branch. This requires a small response-phase ref, not an abort-reason compatibility service.

The fake-host oracle compares application outcomes and cancellation/request traces at the observable deadline boundary. It does not compare AbortSignal reasons or internal timer handles.

Confirmed APIs are:

- `FetchHttpClient.layer`, `FetchHttpClient.Fetch`: `node_modules/effect/src/http/FetchHttpClient.ts:35`, `:254`.
- `HttpClientRequest.get`, `.post`, `.setHeader`: `HttpClientRequest.ts:193`, `:211`, `:366`.
- `HttpClient.execute`: `HttpClient.ts:186`.
- `HttpClient.withScope`: `HttpClient.ts:2814`.
- `Effect.timeoutOrElse`: `node_modules/effect/src/Effect.ts:9148`.
- `Effect.forkIn` with `startImmediately`: `Effect.ts:18281–18352`.

Tests replace `FetchHttpClient.Fetch` with the recording fake. Production uses the native fetch client.

### Browser storage and action API

| Surface | Retained behavior |
| --- | --- |
| Read | `browser.storage.local.get("videoInfoCacheByUrl")` |
| Write | `browser.storage.local.set({ videoInfoCacheByUrl: map })` |
| Pruning | Five-minute background age comparison; load-only pruning is not persisted |
| Popup age | One-hour comparison, strict `>` |
| Icons | Exact default/loading/success path maps at 16, 32, 48 and 128 pixels |
| Tab target | `tabId ? { path, tabId } : { path }`; zero selects the global icon |
| Badge | No badge call |
| Active tab | First result of the existing active/current-window query |
| Runtime message | Exact command object |
| Listener cleanup | Remove the exact session listener on retry cleanup or unmount |

Whole-map writes remain unsynchronized. Section 9 declares malformed-root and selected-entry decoding changes.

### Navigation and passive resource requests

The popup keeps:

```text
vidbee://
vidbee://download?url=<encodeURIComponent(currentUrl)>
```

The download guard remains a truthiness check of `currentUrl`. No format ID or type is added. The desktop defaults the parsed type to `single` (`apps/desktop/src/main/index.ts:346–392`).

Open Client assigns `vidbee://`, waits two seconds, then increments retry. The delay has no OS-launch acknowledgment and survives retry/session cleanup.

The metadata thumbnail remains a browser-loaded image. The `https://vidbee.app` anchor remains an ordinary external anchor with its existing attributes (`P:400–405`, `:437`). Neither becomes an Effect HTTP request.

### Timers and clocks

| Site | Native implementation |
| --- | --- |
| Request deadline | `Effect.timeoutOrElse` around the complete HTTP operation |
| Background prune | One `Clock.currentTimeMillis` read per prune |
| Pending/ready/error timestamps | Separate clock reads at the existing write positions |
| Popup cache age | Clock read at the cache-consumption position |
| Launch delay | `Effect.sleep(2000)` in a document-owned fiber |

The extension application adds no intervals, random values or UUIDs.

MV3 worker lifetime remains browser-owned. An owned fiber scope does not promise that the browser keeps the worker alive. The message listener remains synchronous and does not add a keepalive response.

### Database, subprocesses and files

None exist in this application. The desktop may invoke yt-dlp after receiving `/video-info`; that remains desktop behavior.

The extension imports no SQLite driver, `SqlClient`, downloader process service, Node filesystem module or process-control service. Installed `@effect/platform-node` is 4.1.4 and remains a host/harness dependency, not an extension runtime dependency.

## 7. Pure modules

Pure helpers remain synchronous.

| Symbol or calculation | Existing location | Retained result |
| --- | --- | --- |
| `isValidHttpUrl` | `P:28–33` | Lowercase prefix test |
| `formatDuration` | `P:35–46` | Truthiness, rounding, padding and `Unknown` fallback |
| `formatBytes` | `P:48–60` | Base 1024, four units, decimal-selection rule and `-` fallback |
| `isVideoFormat` | `P:62–67` | Codec truthiness and resolution/dimension fallback |
| `isAudioFormat` | `P:69–71` | Audio codec check with video exclusion |
| `sanitizeError` | `P:103–115` | Exact substring matching |
| Format partitioning | `P:223–240` | Source order |
| Height grouping | `P:242–288` | Height or `/x(\d+)/` fallback, numeric descending groups, stable size ordering, final Other group |
| Deep-link construction | `P:302` | Exact encoding and URI |

Use Effect Array, String and Record operations where the strict rules require them, preserving results. Effect hash-map iteration must not define group output order.

`pruneCache` becomes a synchronous calculation over a supplied map and `now`; obtaining the clock is effectful. Cache reads, icon calls and navigation remain service operations.

Do not add Effects or Promises to formatting, classification or URI construction.

The permanent pure oracle applies the port guide’s parity boundary: old successful results for undefined, null, wrong-kind JSON scalars and NaN remain equal. An old engine failure outside declared types requires failure, without recreating its text. Arrays and objects in scalar positions do not acquire a new pure-helper parity contract.

The response decoder’s normalization is a separate boundary policy. The pure functions retain their results when called directly; section 9 declares the response-to-render differences caused by passing a normalized projection to them.

## 8. Entry points and wiring

### Runtime ownership

`src/Background.entry.ts` owns one `ManagedRuntime.make` call for the worker execution context. Layer acquisition needed for listener installation is synchronous and warmed before registration. Browser callbacks enter the captured owner context, including its logger.

`entrypoints/background.ts` keeps `defineBackground` and calls that entry module. No `ManagedRuntime` or `Effect.run*` call appears in `background.ts`.

`entrypoints/popup/main.tsx` owns popup document startup. It preserves the root-present/root-absent behavior and StrictMode wrapper. It supplies the lifecycle-only session adapter selected in section 5.

Add and import:

```text
@effect/platform-browser/BrowserRuntime
```

Its `runMain` supplies useful document ownership: it interrupts the root fiber on a non-persisted `pagehide`, ignores back/forward-cache pagehide, and removes its listener when the root exits. This is verified in `~/YeeBois/projects/beep-effect/node_modules/@effect/platform-browser/src/BrowserRuntime.ts`.

The popup root program remains alive while the document lives and owns registry disposal, controller scope closure and React-root cleanup. It does not complete immediately after rendering and thereby release its resources.

The popup’s atom factory and root composition share one memo map and shared Layer values. The entry point owns the registry and injects it through `RegistryContext.Provider`. This gives document cleanup direct ownership and avoids treating the binding provider’s delayed disposal as listener-session cleanup.

Background worker composition does not import `BrowserRuntime`: a worker has no document `pagehide` lifecycle.

### D25 and dependencies

Add root catalog entries:

```json
{
  "@effect/platform-browser": "4.1.4",
  "@effect/atom-react": "4.1.4"
}
```

Both pins are verified in the reference root catalog and package manifests.

The extension imports browser-platform for `BrowserRuntime.runMain`, so D25 has an actual dependency use. Its HTTP remains `effect/http/FetchHttpClient` in both contexts.

The reference browser package also exposes an XHR-backed client (`BrowserHttpClient.ts:488–496`). That transport is not selected: a service worker has no XMLHttpRequest, and switching popup transport would add unnecessary wire differences.

Application dependencies are `effect`, `@effect/platform-browser`, `@effect/atom-react`, React and React DOM through `catalog:`, plus `@vidbee/schema` through `workspace:^`. Tests use the catalog’s `@effect/vitest` and Vitest. Keep required WXT and compiler tooling.

No `@beep/*`, compatibility runtime or desktop bundling dependency is added.

### Scripts and preparation order

The package scripts are:

```json
{
  "dev": "wxt",
  "dev:firefox": "wxt -b firefox",
  "prepare:wxt": "wxt prepare",
  "compile": "bun run prepare:wxt && tsrs -p tsconfig.json --emitDeclarationOnly && tsrs -p tsconfig.test.json",
  "check": "bun run compile && biome check .",
  "test": "bun run prepare:wxt && bunx --bun vitest run",
  "build": "bun run prepare:wxt && wxt build",
  "build:firefox": "bun run prepare:wxt && wxt build -b firefox",
  "zip": "bun run prepare:wxt && wxt zip",
  "zip:firefox": "bun run prepare:wxt && wxt zip -b firefox",
  "postinstall": "wxt prepare"
}
```

Implementation API correction: installed WXT 0.21.5 defines no `-b` option for `prepare` (`node_modules/wxt/dist/cli/commands.mjs:56–61`). The supported browser-neutral prepare command precedes both browser builds; the build/zip command selects Firefox. The former `wxt prepare -b firefox` example fails with `CACError: Unknown option -b`.

WXT preparation registers the build configuration, discovers entrypoints and generates `.wxt` types (`node_modules/wxt/dist/prepare.mjs:5–9`). It must precede strict compilation. A package postinstall is not the sole guarantee that a fresh or cleaned checkout has the generated files.

Local order is install, WXT preparation, configuration comparison, strict compile/check/test, build and zip.

In the reusable Extension build workflow, retain:

1. Checkout.
2. Pinned Node and Bun setup.
3. Frozen dependency installation.
4. Explicit WXT preparation.
5. Extension compile.
6. Extension check and tests.
7. Extension build.
8. Extension zip.
9. Existing hidden-file artifact upload.

The scripts also prepare their own prerequisites, so direct invocations remain valid. Repeated preparation may be factored into an explicit Turbo prerequisite only after cache restoration of `.wxt` is proven.

`.github/workflows/ci.yml:55–60` continues to invoke the reusable extension workflow. The upload path remains `apps/extension/.output/*.zip` with `include-hidden-files: true` (`extension-build.yml:46–55`).

Add `vidbee-extension` to root check/test filters and `apps/extension` to strict Biome scope. Keep legacy desktop formatting and audit globs unchanged. Ignore `.wxt`, `.output`, declaration output and generated oracle material appropriately.

Turbo’s extension build outputs include `.output/**`; strict declaration outputs include `dist/**`. No cache hit may omit generated WXT declarations needed by a later check.

Preserve the manifest’s public key, English default locale, locale references, `activeTab` and `storage` permissions, and `http://127.0.0.1/*` host permission.

## 9. Deliberate changes

The following changes are declared rather than hidden as consequences of adopting Effect.

| Boundary | Before | After |
| --- | --- | --- |
| Truthy non-string tab URL | admitted, stored raw as the entry's url | handled as an absent URL |
| Detached popup initialization/navigation failure | Unhandled Promise rejection at query/read or navigation failure | Failed fiber logged at the same boundary; no new UI transition or retry (the existing sections 4 and 12 failure-reporting policy) |
| Detached icon failure | Unhandled Promise rejection | Failed icon fiber logged through Effect Logger; metadata behavior unchanged |
| Initial cache-read failure | Initialization/task rejection | Failed fiber logged; no new error entry or UI transition |
| Pending-entry write failure | Rejection outside request catch | Failed fiber logged; no request and no error entry |
| Error-entry write failure | Rejection; default icon not started | Failed fiber logged; default icon still not started |
| Non-object successful metadata response root | Stored unchecked; popup outcome depends on root truthiness and property reads | Existing request-error path stores `Invalid video info.` |
| Null modeled metadata field | Stored as null; usually consumed through existing empty/fallback behavior | Omitted from the new stored metadata projection |
| Wrong-kind modeled metadata field | Stored unchecked; may render, classify, coerce or fail later | Omitted independently; the object response remains accepted |
| Non-array `formats` | Stored unchecked; strings can be iterated, other kinds can fail rendering | Omitted; popup uses an empty formats array |
| Non-object format element | Retained in count or causes property-access failure | Dropped from the decoded formats array |
| Unknown metadata fields | Copied into new ready storage entries | Dropped by closed decoding; popup does not render those unknown fields |
| Present non-record storage root | Falsy roots become empty/miss; truthy scalars and arrays proceed through unchecked operations | Initial read fails and logs before the loading icon or second background read; no substitution or rewrite |
| Undecodable selected cache entry | Unchecked property reads determine behavior | Cache miss; read leaves the original entry untouched |
| Undecodable pruning timestamp | Missing timestamp is retained; other values can coerce or throw | Entry retained unless a finite decoded timestamp proves it is older than the limit |
| Malformed storage notification root | Unchecked lookup may miss, consume a property or fail | Decode failure is logged; no storage rewrite or invented UI transition |
| Request header name case | The origin header is sent as `X-VidBee-Extension` | Sent as `x-vidbee-extension`: Effect's `Headers` stores names in lower case. HTTP field names are case-insensitive, the desktop's Node server lowercases them and its CORS allow-list matches either spelling, and the value is unchanged |

The response root policy includes null, arrays and JSON scalars. Today, a truthy scalar or array can reach generic metadata presentation through property reads; a falsy `info` does not satisfy the ready-payload guards (`P:146`, `:180`, `:204`). The new stored error is explicit. The unchanged desktop route’s four-field projection is an object, so no assertion is made that it normally emits a rejected root.

For object metadata, section 3’s per-field matrix declares these rendered differences:

- Truthy wrong-kind titles become `Untitled video`, including cases that previously rendered a number, rendered no text or failed as React children.
- Wrong-kind thumbnails no longer create an image, coerce a source or render a guarded-expression zero.
- Boolean true duration changes from `0:01` to `Unknown`; numeric strings and other coercible wrong kinds lose their old duration rendering. Boolean duration is producer-reachable in the synthetic vendored probe.
- Wrong-kind ID/extension values lose their previous cell rendering and key interpolation.
- Wrong-kind codec, resolution and dimension values lose their classification/grouping effects.
- Wrong-kind sizes lose their formatting and sorting effects; some former rendering failures become successful fallback rendering.
- Non-array format values and dropped non-object elements can change counts, empty-state rendering and failure outcomes.
- Null optional fields and unused `format_note`, `fps` and `tbr` can change stored representation without changing rendered output.

Where the old rendered result already equals absence, the oracle must prove equality. The declaration does not permit changing valid string/finite-number behavior or unrelated fields.

### Malformed storage-root traces

The old background returns a truthy root unchanged (`B:143–149`). `loadCache` prunes and reads the selected key; the pending save reads again, prunes, assigns and writes (`B:152–175`). Assignment is outside the request catch (`B:183–193`).

For scalar root `1`, with an ordinary HTTP URL key:

```text
old: get → loading icon → get → assignment failure
new: get → root decode failure logged
```

There is no old `storage.set` or HTTP request. Strict-mode execution of the old source fails at the pending assignment. Roots true and `"x"` have the same relevant trace.

For an empty array root, with successful recording storage and HTTP operations:

```text
old: get → loading icon → get → set(pending array)
     → GET status → POST token → GET video-info
     → get → set(ready array) → success icon

new: get → root decode failure logged
```

The old array accepts the URL property assignment and passes the array to storage. The browser’s serialization of that array is characterized separately; the design does not convert this malformed array into a record or infer that a named array property becomes a durable cache entry.

An array containing a null entry can fail earlier during old pruning. That is a separate characterization case, not a replacement for the empty-array trace.

For popup initialization with scalar `1` or empty-array root and an ordinary fixture URL:

```text
old: add listener → reset state → query tab → get
     → sendMessage → get

new: add listener → reset state → query tab → get
     → root decode failure logged
```

The old lookup misses in those two cases. The new initialization ends at the read, leaving its existing loading state; it adds no error state. No storage write occurs in either popup path. Present falsy roots formerly produced empty/miss behavior and now fail; an absent key still means no cache.

### Selected entries and pruning

Selected-cache cases include:

- Missing or wrong-kind `url`, `status` or `fetchedAt`.
- Numeric-string, null, boolean or non-finite timestamps.
- Unknown status values.
- Invalid stored `info`, format arrays or modeled metadata fields.
- Non-string error values.
- Scalar or null entries.

Today, these can produce a ready hit, a popup error, a loading state, a later rendering failure, a subtraction result or an immediate property-access failure. The new reader consistently treats an undecodable selected entry as absent. A later normal fetch may replace that URL’s entry; the read itself does not delete it.

A cache entry with valid required fields and absent `info` or `error` remains decodable. Do not make ready/error payloads conditionally required.

Pruning retains missing timestamps as before. Numeric strings, null and booleans could previously coerce into old timestamps and be removed; they are now retained as undecodable timestamps. Null entries could previously fail property access and are now retained by pruning. Non-finite timestamps are retained rather than used in arithmetic.

Internal Promise/microtask changes, native fiber scheduling and the absence of the old abort reason are outside this unit’s parity contract. They do not authorize changed request order, deadlines, storage timing, listener return values or rendered output beyond this section.

Every changed characterization assertion retains its pre-port expectation beside the new one and is listed in the phase report and `OWNER-REVIEW.md`.

## 10. Verification the implementation owes

### Characterization before replacement

Freeze `9dab889` or the actual immediately preceding implementation commit as the pre-port source revision. Execute the old source from git; do not reconstruct an approximation of it. Preserve module strictness when executing extracted source.

| Area | Required observations |
| --- | --- |
| Pure helpers | Rounding boundaries, large sizes, codec/dimension classification, resolution parsing, stable sorting, duplicate IDs and substitution matrix |
| Discovery | All 21 ports fail; first/middle/last success; false/null/scalar/malformed status body; redirects; token failure after selection |
| Requests | Method, exact URL bytes and query order, extension header, absent body, no retries, deadlines covering body reads |
| HTTP errors | Truthy/falsy error/details combinations, malformed body, transport causes and timeout phases |
| Metadata | Every modeled field independently absent/null/wrong-kind; root rejection; non-array formats; dropped elements; unknown fields; valid neighboring fields retained |
| Cache | TTL equality and one millisecond past, backward clock, ready/error/pending, malformed selected entries, unrelated raw entries and lost updates |
| Root storage shape | Absent key; null/falsy scalar; truthy scalar; empty array; array containing null; exact old/new traces from section 9 |
| Failures | Initial read, pending write, ready write, error write and icon failure at their original control-flow boundaries |
| Messaging | Exact outgoing command; background listener returns undefined synchronously for accepted and ignored messages |
| Popup | Listener before query, invalid/no tab, cache use, retry bypass, send failure followed by final read |
| Cleanup | StrictMode setup/cleanup/setup, immediate listener removal/re-registration, retry during suspended work and continuations after release |
| Rendering | Idle/loading/error/ready, connection and invalid-page text, video/audio/other formats, thumbnail and empty state |
| Handoff | Exact URIs, empty-current-URL guard, assignment failure and two-second delayed retry |

The browser fake independently suspends query, storage, messaging, icon and fetch operations. It records calls and settlements so tests establish observable order without comparing microtask indices.

The malformed-root suite asserts that new background failures occur before loading-icon invocation and before the second read, perform no write, and release URL admission. Popup root failures end the initialization without sending a message or inventing an error transition.

### Permanent differential oracles

Keep two permanent suites.

1. **Pure oracle.** Run pre-port helpers and grouping calculations from git against the ported functions. Substitute each field independently with undefined, null, false, true, zero, another number, NaN, empty string and another string. Add boundary values and selected interacting pairs. Compare successful results exactly under the port guide’s out-of-type policy.
2. **Boundary oracle.** Drive pre-port background and popup logic and ported logic against the same recording browser/fetch fake. Compare server-visible requests, deadline/cancellation behavior, storage writes and their order relative to requests, icon calls, message objects, synchronous listener return values, rendered output and navigation observations.

The boundary oracle includes a per-field response-to-render matrix. It sends each substituted response through the old storage/popup path and the new decoder/storage/popup path. It compares rendered output, grouping, counts, keys where observable, image requests, and storage projections.

For null/wrong-kind values whose old behavior already equals absence, require equal rendering. For a difference declared in section 9, keep both exact expectations. Do not let a broad “malformed metadata” allowance hide a new difference in a neighboring valid field.

Add arrays and objects to the boundary decoder matrix even though they do not create a new pure-helper parity obligation. Include strings `"0"`, `"1"`, `"60"`, `"1024"` and `"x"` where they distinguish old numeric coercion from omission, and pairs covering primary/approximate filesize and height/resolution fallback.

The oracle normalizes internal fetch representation, not observable URL or header differences. A string versus URL object and undefined-valued request options are irrelevant only when they produce the same boundary request.

Keep frozen old results as fixtures. Do not derive expected values from the new implementation. Isolate old-source execution so its native collections and Promise implementation are data for the oracle, not copied unported application code inside the strict unit.

Use `@effect/vitest` and `bunx --bun vitest run` for strict tests. Test services control time and dependencies. Tests do not construct their own runtimes in ordinary test modules.

### Desktop API goldens recorded before this phase

The existing harness covers token issuance and missing-url behavior, but does not establish the complete successful extension flow (`apps/desktop/scripts/port/golden/cases.mjs:510–550`).

Record on the packaged pre-port build:

| Case | Required observation |
| --- | --- |
| Metadata success | Trusted bodyless POST token, then metadata GET for a namespace-local media URL; complete response |
| Token single use | Repeat the consumed-token metadata request and retain exact rejection |
| Origin binding | Consume a token under another admitted test origin when the baseline fixture supports it |
| Metadata failure | Local deterministic fixture failure through `/video-info`; retain status/error |
| Request sequence | Status probe, token request and encoded metadata request, including exact extension header |

Use deterministic loopback media fixtures. If an HTML page is needed, serve actual deterministic HTML and a local thumbnail rather than relying on a catch-all media route.

The new desktop-API metadata cases use one additional named normalization:

```text
extension-format-user-agent:
  response.body.formats[*].http_headers["User-Agent"] → "<user-agent>"
```

Apply it only to that exact property in format objects of the new desktop-API cases. Do not remove headers, format objects or any surrounding response data. All other response fields remain literal apart from the harness’s existing approved root, port, token and runtime normalization.

Document the rule and reason in `docs/effect-port/GOLDENS.md` before recording the baseline. Vendored `random_user_agent` chooses a random Chrome major version (`vendor/yt-dlp/yt_dlp/utils/networking.py:17–21`, `:162`); downloader defaults copy those headers, `_calc_headers` combines them, and format processing assigns the result to each format (`YoutubeDL.py:747`, `:2687`, `:2983`). The desktop forwards those format objects unchanged.

The fixture’s yt-dlp configuration is unchanged. Do not pin a User-Agent through fixture settings. The existing normalizer has no User-Agent rule (`apps/desktop/scripts/port/golden/normalize.mjs:55`); this is a narrow addition for the named new cases.

Test the normalization directly: only the specified property changes, sibling headers remain literal, format ordering remains literal, and a differing non-User-Agent field still fails comparison.

Keep raw receipts outside committed synthetic fixtures.

### Real Chromium inside the offline namespace

Add one harness worker under `apps/desktop/scripts/port/golden/` that runs the built extension in Chromium inside the existing offline namespace against the packaged fixture application.

Use a capable host Chromium. The inspected host has `/usr/bin/chromium`, reporting Chromium `157.0.8103.79`. Installed browser declarations expose:

```ts
chrome.action.openPopup(options?: { windowId?: number }): Promise<void>
```

The declaration identifies general availability from Chrome 127 and the earlier policy-install restriction (`node_modules/@wxt-dev/browser/src/gen/index.d.ts:194–197`, `:305–315`). Version and declarations do not prove the host build permits unpacked loading or popup opening; the worker verifies both capabilities against the executable it actually launches.

The capability probe:

1. Resolves an explicitly configured executable or a known host Chromium candidate.
2. Launches an owned disposable profile with unpacked-extension flags.
3. Connects through CDP and verifies the expected extension service-worker target and extension identity.
4. Creates a normal browser window with a harmless namespace-local page as its active tab.
5. Attaches a CDP session to the extension’s own service-worker target.
6. Uses CDP `Runtime.evaluate` with `awaitPromise: true` to verify and invoke `chrome.action.openPopup({ windowId })` in that worker’s execution context.
7. Verifies that the actual action-popup target appears and can be inspected.

The probe records the Chromium version, the invoked API and the separate unpacked-load/open-popup results. It does not infer support from an executable name, version or accepted command-line flags.

If no executable loads the unpacked extension, emit:

```text
SKIP extension browser proof: no available Chromium loads the unpacked extension
```

If unpacked loading succeeds but no candidate can open the action popup through its worker target, emit:

```text
SKIP extension browser proof: available Chromium cannot open the extension action popup
```

Exit successfully for those missing capabilities so hosted CI remains green. Record the skip as missing browser proof, not successful integration.

After capability passes, the metadata scenario:

1. Opens the fixture page as the active tab of a normal window and records its window ID.
2. Closes the probe popup and prepares observation of the next popup before opening it.
3. Calls `chrome.action.openPopup({ windowId })` through the extension’s service-worker CDP target.
4. Attaches to the resulting action-popup target.
5. Records the actual result delivered by the popup’s `browser.tabs.query({ active: true, currentWindow: true })`.
6. Asserts that its first tab URL equals the fixture URL before accepting any metadata-flow result.

Use a CDP script installed before popup application initialization to wrap and record the real tabs query result while forwarding the original call and result unchanged. The worker must retain the observation made inside the popup; a separate service-worker query is not sufficient evidence of the popup’s result.

The existing popup performs that query at `P:166`, then applies the lowercase HTTP(S) prefix test at `P:167–175`. Opening `popup.html` as an ordinary active tab would change the query’s context and is not the selected mechanism.

Once the capability probe passes, a wrong queried URL, missing access needed to return that URL, absent query observation, handshake failure, rendering failure or storage failure is a failed scenario. These are not unsupported-browser skips.

The worker:

- Loads `apps/extension/.output/chrome-mv3`.
- Checks the extension identity derived from the unchanged manifest key.
- Uses the actual action popup for the fixture’s normal window.
- Observes real Origin/header behavior and the token exchange.
- Waits for ready storage and rendered format rows using bounded conditions.
- Exercises cache reopen, retry through safe controls or controller test seams, metadata failure and connection failure.
- Retains screenshots, request traces, queried fixture URL, capability receipts and browser/worker errors.
- Closes only its owned browser and fixture resources.

The browser process starts with scratch `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `XDG_DATA_DIRS`, with no inherited protocol-handler registration. The harness verifies its isolated environment cannot discover a `vidbee` handler.

The worker never clicks either control that assigns a `vidbee://` location: Open Client or Download with VidBeep. It does not intercept a real protocol launch after allowing it to start. Both handoff URIs and delayed retry are proven at unit level through `ExtensionNavigation`.

### Persisted real-data proof

Browser storage, rather than `vidbee.db`, is this unit’s persistence surface.

Use a browser-supported snapshot or disposable copy of extension storage without opening or mutating the live profile. Validate only that copy.

Report entry counts and anonymized failing schema paths. Do not report URL keys, titles, thumbnails, tokens or metadata content. If no safe copy exists, record real-storage proof as missing.

### Gates and manual coverage

After implementation, verify the pinned Node version and follow the port guide’s order:

1. Extension strict check and tests, with WXT preparation and resolved-option comparison first.
2. `bun run port:check`.
3. `bun run check`.
4. `bun run test`.
5. `bun run deps:check`.
6. Extension compile, build and zip.
7. `bun run build:linux`.
8. `bun run --cwd apps/cli build`.
9. `bun run test:golden`.

Preserve existing goldens except explicitly declared changes. Run the new browser worker when both capabilities exist.

Inspect the built manifest, worker/popup assets and archive contents. Verify no unresolved workspace imports or Node-only runtime modules enter the extension.

Manual offline coverage includes the 360-pixel popup, light/dark modes, reduced motion, keyboard focus, icon transitions, cache reopen, retry/error recovery and worker restart. Keep all markup, class names, texts and assets.

Local static proof, local packaged proof, browser proof and hosted CI are separate receipts.

Offline proof does not establish remote-site extraction, authentication, remote thumbnails, the website destination, store installation, Firefox trusted-origin success or Windows/macOS protocol behavior.

## 11. Behavior kept as it is

Candidates for later review, not fixes in this phase:

- Discovery trusts HTTP success and ignores the body’s `ok` field (`B:82–89`, `:106–117`).
- Token failure does not continue scanning (`B:125–133`).
- The background TTL is five minutes; the popup TTL is one hour (`B:35`; `P:26`).
- Retry bypasses only popup cache. The background can reuse a ready entry without writing (`B:183–187`; `P:177–196`).
- Concurrent whole-map saves can lose another URL’s update (`B:171–175`).
- Duplicate URL work uses only the first invocation’s icon target (`B:178–180`).
- Tab ID zero selects the global icon; popup messages commonly have no sender tab (`B:64`, `:217`).
- Icon completion is detached from metadata success. Only failure reporting changes.
- Initial cache/pending-write failures stay outside the request catch. Error-write failure still prevents the default icon call (`B:183–200`).
- The listener does not return a Promise or explicitly keep the worker alive (`B:212–219`).
- Storage deletion or removal of the selected entry does not clear the popup (`P:135–144`).
- Listener activity guards storage callbacks only. Previously started initialization can update state after cleanup (`P:125–219`).
- URL acceptance is a lowercase HTTP(S) prefix test, with no supported-site check or navigation subscription (`P:28–33`, `:166–175`, `:221`).
- Invalid-page initialization does not reset the previous `currentUrl`.
- Pending notifications set loading without clearing the independent info/error fields.
- Other formats contribute to the count but are not rendered. Resolution can classify an audio-looking format as video (`P:62–71`, `:223–288`, `:469–470`).
- Duplicate format IDs/extensions can produce duplicate React keys (`P:458`, `:486`).
- Open Client waits a fixed two seconds without launch acknowledgment or retry/unmount cancellation (`P:290–308`).
- Download handoff sends the URL without a format selection or type parameter.
- Popup text remains hardcoded English despite locale resources.
- Floating content-button CSS and unused locale messages remain although no content entrypoint exists.
- Firefox scripts remain; Firefox UUID origins are not automatically trusted by the desktop.

These statements apply subject to the explicit malformed-data changes in section 9.

The existing rendered strings remain exact, including `Working`, `Error`, `Ready`, `Idle`, `Analyzing video...`, `Open a video page`, `Connect the VidBeep app`, `Something went wrong`, `Client connection failed`, `Untitled video`, `No compatible formats.`, `Audio Only`, `Open Client`, `Download VidBeep`, `Retry`, and `Download with VidBeep`.

## 12. Open questions for the architect

### Recorded decisions

1. **Whole application port.** `apps/extension` becomes strict. No compatibility sibling or temporary Promise facade is introduced.
2. **Boundary parity.** Preserve requests, deadlines, storage writes and ordering, icon calls, runtime messages and synchronous listener return values, rendered output and navigation URIs. Internal Promise/microtask ordering is not owed.
3. **Native execution.** Use Effect HTTP, complete-operation timeouts, owner scopes, fibers, refs and atoms. Do not introduce timing-turn services, raw-fetch compatibility transport, legacy runners or abort-reason emulation.
4. **Failure reporting.** The specified detached rejection sites become logged fiber failures at the same control-flow boundaries. They do not create additional cache entries or UI transitions.
5. **Metadata decoding.** Require an object response root. Decode modeled fields independently; null or wrong-kind fields become absent, non-array formats becomes absent, and non-object format elements are dropped. Only root rejection stores `Invalid video info.` through the existing request-error path. Closed decoding drops unknown fields. Section 9 declares all resulting boundary differences.
6. **Three data contracts.** Distinguish normal vendored output, arbitrary unchecked desktop passthrough and historical browser storage. Numeric format IDs become strings in the normal producer. Boolean numeric fields are not ruled out; the synthetic vendored probe confirms boolean duration.
7. **Permissive discovery/token observations.** Any 2xx status ends discovery. Token truthiness remains the acceptance rule.
8. **Storage.** Keep an unknown-valued plain record, decode only consumed entries and pruning timestamp projections, retain undecodable entries, preserve unrelated values and keep unsynchronized whole-map replacement.
9. **Malformed storage roots.** A present non-record root fails at the initial read and is logged. No empty record is substituted and nothing is rewritten. Section 9 records scalar and array background/popup traces.
10. **Browser platform.** Add `@effect/platform-browser` 4.1.4 and use `BrowserRuntime.runMain` for popup document ownership. Use Effect’s fetch client in both contexts.
11. **Popup convention.** Add `@effect/atom-react` 4.1.4, share one document registry/runtime factory, feed independent atoms from an Effect controller and render synchronously. Retry does not cancel document-owned work.
12. **StrictMode listener sessions.** Use the lifecycle-only composition adapter. Atom mounting and delayed registry disposal do not reproduce immediate cleanup and re-registration.
13. **Permanent proof.** Keep pure and boundary differential oracles against git source. Compare boundary observations, not microtask positions. The response-to-render matrix proves empty-equivalent cases and records declared differences individually.
14. **Metadata golden normalization.** Keep fixture yt-dlp configuration unchanged. Add only the named format User-Agent normalization for the new desktop-API cases, document it in `GOLDENS.md`, and record the pre-port baseline with it.
15. **Browser worker.** Use a host Chromium that passes separate unpacked-extension and action-popup capability probes; otherwise report a visible successful skip naming the missing capability.
16. **Popup context.** Open the fixture as the active tab of a normal window and invoke `chrome.action.openPopup({ windowId })` through the extension’s own service-worker target over CDP. After capability passes, the popup’s actual tab-query result must equal the fixture URL; a mismatch fails the case.
17. **Protocol isolation.** Never click protocol-launch controls in browser proof. Start Chromium with isolated handler-discovery directories. Prove handoff URIs and delayed retry through the injected navigation service.
18. **Tooling.** Prepare WXT before strict compilation. Use ordered tsconfig inheritance after an option-by-option comparison; use the base-only fallback if equivalence fails. Preserve generated declarations and aliases. Do not change the checker.

No architectural matter remains open in this revision. Capability and compiler comparisons are implementation gates with the selected outcomes and fallbacks above.

## 13. Review

Reviewer: an independent session on the review-panel tier, read-only, on 2026-11-19. It read the governing documents, extension source and assets, desktop metadata path, installed libraries and offline harness, and ran in-memory and synthetic producer probes. One major finding, two minor findings and one question; no evidence-backed blocker.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Major | The complete metadata golden varies because vendored yt-dlp places a randomized User-Agent in each format’s headers. | Section 10 adds the narrow named `extension-format-user-agent` normalization only for `formats[*].http_headers["User-Agent"]` in the new desktop-API cases, documents it in `GOLDENS.md`, keeps fixture configuration unchanged and requires baseline recording before the port; section 12 records the decision. |
| 2 | Minor | The wire analysis conflates unchecked desktop passthrough with normal vendored normalization and leaves field acceptance unsettled. | Section 3 separates the three contracts, corrects numeric `format_id`, records boolean numeric-field reachability, declares independent field decoding and gives the per-field old/new rendering table; section 9 declares differences and section 10 pins them through the differential oracle. |
| 3 | Minor | Rejecting a non-record storage root changes observable calls before failure without declaring the change. | Sections 3 and 9 require initial-read failure without substitution or rewrite and give scalar/array background and popup traces; section 10 adds characterization for absent, scalar, falsy and array roots. |
| 4 | Question | Opening the popup is unspecified and may cause its active-tab query to select an extension page instead of the fixture. | Sections 10 and 12 select a normal fixture window and service-worker CDP invocation of `chrome.action.openPopup({ windowId })`, probe unpacked loading and popup opening separately, and require the popup’s actual query to return the fixture URL before metadata proof is accepted. |

The reviewer found sound the application boundary and tooling, native HTTP APIs and body-inclusive deadlines, scoped ownership and failure locations, browser/atom/runtime conventions, independent popup state, TTLs and whole-map writes, and the separation of static, packaged and browser proof; its StrictMode probe selects the lifecycle adapter in sections 5 and 12.