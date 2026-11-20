# Design: `@vidbee/cli` (phase 8)

Status: reviewed, findings resolved (section 13).

Inputs: the master port plan, sections 3–7, the phase-8 note and Amendments; the complete port guide; the root compiler configuration and port checker; the source inventory; the recorded architecture decisions; the independent review; the db, task-queue and downloader-core designs; the phase 4 packages and current downloader implementations; CLI source, metadata, build script and executable consumers; installed Effect 4.1.4 and Node platform sources and declarations.

This is a read-only design. Source inspected on clean `main` at `9dab889b0b1d5328721802d65699a5f8593bf2e2`. The requested downloader worktree is absent; its merged design in `docs/effect-port/design/downloader-core.md` and the current implementations supply that precedent. Read-only verification reproduced the pre-port in-memory bundle hash and the pinned-Node JSON diagnostics below. Node is 22.23.4. No implementation, full gate, packaged launch, real-profile operation or liveness-driver diagnostic qualification is claimed.

Paths below are repository-relative. **C** means `apps/cli/src/`. Line numbers identify existing source, not proposed companions. Proposed symbols and files are identified as such.

## 1. What the package is, and what makes its port risky

`apps/cli` supplies the `vidbee` command: about 3,600 lines including metadata and scripts. Downloads go through the desktop automation API, an explicit API URL, or an in-process queue. Probe-class invocations spawn yt-dlp directly. `:version` and `:upgrade` run without connecting.

The executable is the compatibility boundary. `apps/desktop/scripts/port/golden/cli.mjs:5,71` launches `apps/cli/dist/index.mjs`. No source or test in another application or package imports `@vidbee/cli`, its subpaths or its source. This includes the renderer, `packages/ui` and `apps/extension`.

Six properties decide the design:

1. **Its grammar is a token protocol, not a conventional options parser.** Unknown yt-dlp options pass through unchanged. Reserved flags are consumed wherever encountered before `--` or a colon command. A value flag consumes the next token even if that token looks like another flag. Duplicate flags are legal. Ordering can leave `noRetry: true` beside `maxAttempts: 3`.
2. **There is no VidBee help page.** `--help` is neither reserved nor probe-class. It takes the download path. `--version` is a yt-dlp probe; `:version` reports CLI metadata. Adding generated help or version output changes behavior.
3. **Output is JSON with exact serialization behavior.** Expected failures print on stdout. An uncaught rejection reaches the binary’s stderr fallback. Pretty printing, key insertion order, omitted `undefined`, trailing newline and embedded yt-dlp output are observable.
4. **The local transport still uses compatibility owners.** It dynamically loads task-queue-legacy and downloader-core-legacy, starts a queue, and tears it down even after detached admission. Native process differences justify retaining this route. Native kernel callback defects remain dependency obligations of phase 9.1; no executable sequence reaching those particular defects is established.
5. **The HTTP client is permissive.** It parses text as JSON, often passes unexpected values onward, renews once on 401, and exposes original fetch messages. Wire task IDs are unchecked at runtime despite their string annotations. Replacing casts with strict task-response decoding would change existing results and failures.
6. **Raw process observations matter.** Probe errors and nullable close codes, byte-based capture limits, direct-child TERM and detached launcher lifetime differ from the installed stock process abstraction. The executable installs no SIGINT or SIGTERM handler.

There are no CLI-local tests or package `test` script. Fourteen built-bundle golden cases cover version, readers and selected errors; they parse JSON and therefore do not establish byte parity (`apps/desktop/scripts/port/golden/cli.mjs:20–28,46–94`).

## 2. Shape of the port

The strict application contains schemas, pure parsing and formatting calculations, the Effect program, service contracts and native layers. Existing filenames stay. New companions follow D21.

For a given argv, environment, stdin and file and network state, A2 is owed at the executable’s boundaries:

- Bytes on stdout and stderr.
- Exit code and termination signal.
- HTTP method, URL bytes, headers, body, request order and retries.
- Files read and written, their paths and contents.
- Processes spawned, including argv, environment and signals.

Internal Promise settlement and microtask ordering are outside this CLI boundary. The CLI introduces no `LegacyTiming` service, named microtask turns or Promise-settlement compatibility machinery. Existing compatibility owners retain their own implementation until their cutover.

Where the old executable produces an uncaught Node error with a stack trace, the replacement owes failure, a nonzero exit code and stderr output. It does not owe the stack’s bytes. Section 4 lists those cases.

Only section 9 authorizes changed behavior.

### Strict unit and narrow host

`apps/cli-legacy`, named `@vidbee/cli-legacy`, is a private, temporary, unported host. It contains:

1. The bin entry and layer composition, including the `node:os.homedir()` capability supplied to `CliHost`.
2. The local in-process transport over the existing task-queue-legacy and downloader-core-legacy owners, including the borrowed better-sqlite3 handle.
3. The raw process adapter for yt-dlp probes and the detached desktop launcher.

The settled liveness qualification in section 12.8 permits one conditional addition: if the exact strict signal-zero driver fails the full diagnostic suite, the host supplies only that capability, with the forcing rule recorded. Process-list probing is not an alternative.

Each adapter implements a service declared by the strict CLI. The strict CLI also ships native local and process layers and tests them separately. Home-directory lookup remains an entry-composition input until a native source is selected for the phase-10 strict entry.

Everything else belongs in `apps/cli`: parsing, dispatch, envelopes, redaction, automation HTTP, descriptor reading, autostart polling, version lookup and upgrade logic. There is no compatibility HTTP driver, synchronous-file compatibility layer or synchronous-write output adapter.

The dependency is one-way:

```text
@vidbee/cli-legacy
  ├─ @vidbee/cli
  ├─ @vidbee/task-queue-legacy
  ├─ @vidbee/downloader-core-legacy
  └─ @vidbee/db/legacy

@vidbee/cli
  ├─ @vidbee/schema
  ├─ @vidbee/task-queue
  ├─ @vidbee/downloader-core
  ├─ @vidbee/db
  ├─ effect
  └─ @effect/platform-node
```

The host exists because native process behavior still differs observably, not because unused library exports need a Promise facade. Section 8 distinguishes those executable differences from retained dependency obligations.

After phase 9.1 resolves the native kernel and process obligations, executable composition moves to native layers. Phase 10 deletes `apps/cli-legacy` after the strict entry also meets the home-directory, liveness and signal requirements in section 12. The permanent byte oracle judges the cutover. Any difference then remaining is listed as a declared change at that time.

### Export entries

The three existing export entries stay and expose the strict API.

| Existing entry | Strict disposition | Existing external consumer files changing imports |
| --- | --- | ---: |
| `.` | Pure helpers, schema-derived types, Effect program, operations, services and layers | 0 |
| `./parser` | Pure scanner helpers, schema-derived parser models and schema-backed parse failures | 0 |
| `./envelope` | `ExitCode`, `exitCodeForError`, `errorEnvelope`, `renderEnvelope` and schema-derived envelope types | 0 |
| `bin.vidbee` | Strict program, temporarily composed by the host entry | 0 |

Pure helpers retain their existing data-first signatures. Required pipeable overloads are additive. Effectful execution APIs replace unused Promise APIs; there is no Promise facade for exports nobody imports.

`apps/cli/package.json:20–41` currently points source imports at `src/index.ts`, but its published default and `main` point at the executable bundle. Strict exports are represented consistently in workspace and publication metadata. The executable remains available through `bin.vidbee` and its existing artifact paths. Moving a published root export from executable evaluation to the strict library API is an explicit metadata/API change in section 9.

The existing advertised `types: ./dist/index.d.mts` has no corresponding declaration-build step. The port emits actual declarations for all three retained entries. Section 8 fixes their output paths and build order.

### Symbol dispositions

| Existing symbols | Ported form |
| --- | --- |
| `selectTransport`, `validateApiUrl`, `isLoopbackOrPrivateHost`, `transportNotReady` | Same pure synchronous signatures and results |
| `redactArgs`, `redactText`, `REDACTED_PLACEHOLDER`, `buildForwardedInput`, `compareSemver`, envelope helpers | Same pure synchronous signatures and results |
| `parseArgv`, `parseListArgs` | Pure schema-backed calculations; retain successful return signatures and deliberate parse-error fields/messages |
| `ParseError`, `AutomationHttpError` | Schema-backed tagged errors; unused native constructors are not retained as a compatibility API |
| `run`, `dispatchSubcommand`, `connect`, `enqueueDownload`, `runProbe`, `checkUpgrade` | Effect operations over services |
| `AutomationClient` | Per-session Effect owner retaining token state and loose wire values |
| `createLocalClient` | Effect acquisition returning a client and explicit shutdown operation |
| `readDescriptor`, `resolveDescriptorPath`, `isPidAlive`, `ensureDesktopReady`, `readCliVersion`, `defaultCachePath` | Native service operations where they read host state; explicitly supplied pure calculations remain pure |
| Old Promise/callback option types, `RunIO`, `ContractClient`, `LocalClientHandle` | Effect contracts replace execution interfaces; schema-derived data types retain structural shapes, with wire values distinguished from domain values |

The pure scanner can return a `Result` internally. The retained synchronous `parseArgv(argv)` and `parseListArgs(args)` entry points return their existing successful shapes and throw the corresponding schema-backed deliberate failure. Dispatch uses the calculation’s typed failure directly. This preserves pure call shapes without keeping an execution facade.

## 3. Schemas

Schemas precede service contracts. Proposed companions are `Cli.model.ts`, `Parser.model.ts`, `Envelope.model.ts`, `Automation.model.ts`, `Descriptor.model.ts` and `Upgrade.model.ts`.

Public data structures use `S.Struct`, `S.mutableKey`, mutable array schemas where the old arrays are mutable, and optional keys accepting explicit `undefined`. Readonly argv arrays stay readonly. Do not turn structural objects into branded classes. Tagged error classes use the required brand.

Use `LiteralKit` for string unions. Numeric domain fields use `S.Finite`; retain existing semantic checks separately rather than imposing new integer, positivity, URL or semver refinements on every instance. Unchecked automation-wire values remain `S.Unknown`, including identifiers that happen to be numeric. A wire ID is not a numeric domain field.

| Model | Fields and acceptance contract |
| --- | --- |
| `VidbeeFlags` / `Flags` | Preserve every field in `C/parser/index.ts:26–41`: `api`, `local`, `target`, `json`, `pretty`, `wait`, `detach`, `priority`, `maxAttempts`, `noRetry`, `groupKey`, `timeoutMs`, `noAutostart`, `token`; same optionality and defaults |
| `ParsedArgv` | Preserve the subcommand and yt-dlp alternatives, raw token order, retained `--`, nullable first `probeFlag`, and probe/download distinction (`parser/index.ts:43–51`) |
| `ListInput` | Optional status, groupKey, parentId, limit and nullable cursor; no imported API limit cap |
| Envelopes | Preserve the six alternatives in `envelope/index.ts:29–92`, including wait failure without `code`/`message`, and arbitrary subcommand result; HTTP-derived task values and detached projection fields remain loose |
| `DescriptorPayload` | Existing normalized fields in `transport/descriptor.ts:18–32`; version 1 and normalized kind `desktop`; defaults remain field-specific |
| Handshake | String token and finite expiry; `ttlMs` and `schemaVersion` are not newly required; extra keys survive the returned handshake value |
| Automation replies and IDs | Separate wire values from queue domain models; wire IDs are unknown, and list/get/stats/mutation responses remain permissive until an existing field operation requires a value |
| `CliVersionInfo` | `cli`, `contract`, `changelog`; package candidates require matching name and a string version only |
| Upgrade cache | String version and finite fetchedAt; unknown keys are discarded when projected into the two-field cache model |
| `UpgradeCheckResult` | Existing field order and values: current/latest/upToDate/cached/cachedAt/registryUrl/installCommands |
| Probe observations/results | Byte chunks, original raw errors, raw nullable close result, native outcomes, success/error result and capture settings; stdout is text, not necessarily JSON |
| Forwarded input | Reuse task-queue `TaskInput` and `AddTaskRequest`; preserve open `options`, rawArgs and nested CLI metadata |

Do not decode automation `Task` values with the full queue domain schema merely because the old code casts them to `Task`.

- `list` returns `[]` for non-array `tasks`, unwraps elements containing `task`, and otherwise returns elements unchanged. A null root or an invalid element can still fail at its existing operation.
- `get` rejects a falsy body, unwraps a body containing `task`, and otherwise returns it.
- `stats` returns any parsed JSON value, including null after malformed JSON.
- Mutation response bodies are ignored.
- `add` reads `id` without validation and then performs a separate `get`.
- Waiting reads the returned task’s `id` for later `get` calls. It does not keep using the add response’s ID.

`AutomationClient.add` destructures `id` at `transport/automation-client.ts:195–198`; `get` serializes it in `{ id }` at `:156–160`. The string annotations enforce neither a string check nor conversion. `download/enqueue.ts:73` subsequently polls with `task.id`. The strict contracts preserve all three steps without an unchecked string cast.

For ordinary property reads, preserve successful scalar behavior as well as object behavior. An absent property can produce `undefined`, which JSON serialization omits. A new closed task schema must not reject that result. Preserve failures where current null access or use of `in` fails, in the existing runtime catch region; do not convert every unexpected value into a contract-mismatch envelope.

Use `S.fromJsonString(S.Unknown)` for JSON syntax, followed by schemas for the field checks actually made. Keep unknown values until their existing use; do not cast an unchecked wire object into a validated domain task.

### Boundary policies

| Boundary | Today | Port policy |
| --- | --- | --- |
| argv | Strings are scanned without URL validation or yt-dlp option parsing | Decode the token array, then preserve scanner rules |
| Descriptor text | Missing path gives not-found envelope; read/JSON error gives malformed envelope; manual validation follows | Same branches, UTF-8 replacement and BOM preservation; finite-number policies and bounded syntax-message change in section 9 |
| Package JSON | Any read, syntax or property-access failure tries the next candidate | Same fallback; no error output |
| Cache JSON | Read/syntax/access failure or wrong checked fields means cache miss | Same; non-finite fetchedAt is a miss |
| Handshake | Non-2xx fails before shape validation; only token/expiry checked | Same order; preserve additional fields; non-finite expiry fails the existing contract check |
| Other automation JSON | Empty/invalid text becomes null; later operations may succeed, default or fail | Preserve each operation’s result/failure; no blanket schema-mismatch envelope |
| Registry JSON | Non-2xx gives fixed Error; JSON rejection propagates; missing/wrong version gives fixed Error; null root fails during access | Same outcomes and fixed messages; bounded syntax-message change in section 9 |
| Probe output | Arbitrary bytes become UTF-8 strings at completion | Validate byte observations; do not require JSON or normalize child text |
| SQLite | Queue-owned decoded rows and persisted JSON | Reuse queue codecs, defaults, open nested persistence and recovery policies |

`S.fromJsonString` supports `{ space: 2 }` (`node_modules/effect/src/Schema.ts:9918–9926`). Envelope serialization uses the Unknown JSON codec over the already constructed object. It preserves insertion order and ordinary JSON serialization behavior. It does not semantically re-encode through a closed envelope/task schema and erase fields.

The installed Schema JSON getter catches without retaining the engine exception and creates `SchemaIssue.InvalidValue` (`node_modules/effect/src/SchemaGetter.ts:1442–1453`). Render its issue with the public `SchemaIssue.makeFormatterDefault()` from `effect/SchemaIssue`, with default parsing options and no input reporting. For these syntax failures the result is exactly `Expected a valid JSON string`. Do not use `SchemaError.toString()`, which adds `SchemaError(...)`, or emulate the engine’s diagnostic. Section 9 gives the exact old and new messages.

There is no CLI zod schema to retain or delete. Dependencies used by the existing queue/downloader compatibility owners remain owned by those packages.

## 4. Errors

The native error union in proposed `Cli.errors.ts` contains schema-backed parse, HTTP, host, local-client and boundary failures. Errors carry the original cause where applicable and the message needed at the executable boundary.

There is no old library facade to maintain `instanceof ParseError` or `instanceof AutomationHttpError`. Their constructor/API removal is explicit in section 9. The executable preserves their deliberate messages and catch regions.

| Origin | Existing observable class/shape | Executable reproduction |
| --- | --- | --- |
| `parser/index.ts:53,154–277` | `ParseError extends Error`, default name `Error`, code, exitCode 2 | Typed parse failure becomes the same error envelope, compact regardless of an earlier pretty flag |
| `subcommands/index.ts:211–252` | Plain Error with code `MISSING_VALUE`, `INVALID_STATUS`, `INVALID_LIMIT` or `UNKNOWN_FLAG` | Runtime emits `UNKNOWN_ERROR`/2 with the message; it does not expose those internal codes |
| `automation-client.ts:56–71` | `AutomationHttpError`; code, status, body; default name `Error` | Preserve message selection and runtime mapping, usually `UNKNOWN_ERROR`/2 |
| Descriptor read | Native filesystem error embedded in `DESKTOP_NOT_READY` | Preserve the underlying filesystem cause’s message |
| Descriptor JSON syntax | Native SyntaxError embedded in `DESKTOP_NOT_READY` | Preserve `automation descriptor is malformed: `; append the schema issue text declared in section 9 |
| Automation add/get/poll | Unchecked ID and task properties; failures occur at their existing operations | Carry unknown wire IDs without conversion; retain successful request/output values and existing catch regions |
| Local missing task | `Error("task <id> not found")` | Same message and command catch |
| Local add lookup | `Error("add() did not produce a task with id <id>")` | Same message |
| Missing add capability | `Error("transport does not support add()")` | Same message and download catch |
| Registry status | `Error("registry responded <status>")` | Same message, `API_UNREACHABLE`/3 with registry details |
| Registry shape | Error with message ``registry response missing `version` `` | Same message |
| Registry JSON syntax | SyntaxError message becomes the upgrade error envelope’s message | Schema issue text becomes that message; `API_UNREACHABLE`, exit 3 and registry details stay |
| Invalid cache timestamp formatting | RangeError from `toISOString()` | Same failure/message for finite out-of-range timestamps; non-finite cache exception is declared |
| Probe synchronous spawn throw | Arbitrary Error/non-Error | Existing `failed to spawn yt-dlp at <binary>: <message>` envelope |
| Probe asynchronous child error | Original Error message | Existing `yt-dlp spawn error: <message>` envelope |
| Launcher synchronous throw | Arbitrary Error/non-Error | `launch-failed` reason and existing connection envelope |
| Launcher asynchronous child error | Unhandled Node child `error`, outside the launch try/catch | Nonzero exit and stderr; stack bytes are exempt |
| Queue/persistence/downloader | Existing ordinary errors, `IllegalTransitionError`, original driver/host failures | Existing compatibility owners retain their behavior; strict mappings retain messages before CLI formatting |
| Injected callback failures | Arbitrary thrown/rejected value | Preserve the current catch region; no blanket conversion of defects into user errors |
| Uncaught binary rejection | Compact `{ok:false,code:"UNKNOWN_ERROR",message:…}` on stderr, exit 2 | Same deliberate fallback envelope and Error-versus-String conversion, followed by completed stderr output |

The parse messages remain:

| Code | Message |
| --- | --- |
| `UNKNOWN_VIDBEE_FLAG` | `unknown VidBeep flag: <name>` |
| `UNEXPECTED_VALUE` | `<flag> does not take a value` |
| `MISSING_VALUE` | `<flag> requires a value` |
| `INVALID_TARGET` | `--vidbee-target must be one of desktop\|api\|local; got <value>` |
| `INVALID_PRIORITY` | `--vidbee-priority must be user\|subscription\|background; got <value>` |
| `INVALID_MAX_ATTEMPTS` | `--vidbee-max-attempts must be a non-negative integer; got <value>` |
| `INVALID_TIMEOUT` | `--vidbee-timeout must be a positive integer (ms); got <value>` |
| `STDOUT_OUTPUT_DISALLOWED` | `-o - is only allowed in probe mode` |

Exit mapping stays:

- 0: probe success, detached admission, successful wait or successful subcommand.
- 1: nonzero probe, oversized probe output, or non-success wait.
- 2: parsing, ordinary command/download failures and uncaught binary rejection.
- 3: desktop/API reachability and upgrade-fetch failure.
- 4: auth/token envelope codes.
- 5: contract mismatch and not implemented.

Do not correct HTTP exception handling to use its internal auth code. That would change current exit codes.

### Stack-trace exceptions

The following old boundary failures owe nonzero exit and stderr output, without exact stack bytes:

1. The detached launcher’s asynchronous spawn error (`transport/autostart.ts:70–75`).
2. Unhandled stdout or stderr stream errors, including a closed pipe, from the current direct `process.stdout.write` / `process.stderr.write` calls (`bin.ts:17–18,24–27`).
3. Unhandled probe stdout/stderr stream errors: the current probe attaches data listeners and child error/close listeners, but no stream error listeners (`download/probe.ts:72–99`).
4. A raw event-listener exception escaping the existing process path, such as a failure in a data callback. Controlled tests cover this as a failure, not a stack-format contract.

The binary’s `.catch` JSON envelope is deliberate output and is not covered by this exemption. Module-loading failures caught by the existing npm-bin shim also retain that shim’s deliberate formatting.

OS signal termination is separate from these exceptions. SIGINT and SIGTERM retain their signal identity and shell status, as specified in section 6.5.

## 5. Services

All new contracts are `Context.Service` classes with deterministic package/file/service keys. In this table `E<A>` means `Effect.Effect<A, CliError>`; actual methods use the relevant error subset. Proposed contracts are declarations to implement, not installed Effect exports.

| Service | Contract | Native implementation | Temporary host replacement |
| --- | --- | --- | --- |
| `CliProgram` | `run(argv): E<RunResult>` | Scanner, decoded dispatch and existing runtime flow | None |
| `CliOutput` | `stdout(text): E<void>`; `stderr(text): E<void>`; terminal completion | Effect `Stdio` sinks | None |
| `CliHost` | Live environment/configuration operations; platform, home and executing-artifact inputs | Configuration, Path and filesystem capabilities; home supplied by composition | Host entry supplies `node:os.homedir()` |
| `CliDescriptor` | `path(options): E<string>`; `read(options): E<ReadDescriptorResult>` | FileSystem/Path-backed descriptor logic | None |
| `CliPidLiveness` | `isAlive(pid): Effect.Effect<boolean>` | Exact global signal-zero driver, subject to qualification in section 12.8 | Only if a named rule rejects that driver |
| `CliLauncher` | `launch(spec): E<void>` | `effect/process`, explicit options, `handle.unref` | Raw detached Node spawn/unref |
| `CliAutostart` | `ensure(enabled, options): E<AutostartResult>` | Descriptor/liveness/poll loop | None |
| `CliAutomation` | `make(options): E<AutomationSession>` | Per-session state over fetch-backed `HttpClient` | None |
| `CliConnection` | `connect(flags): E<ConnectionResult>` | Existing branch precedence and lazy local acquisition | None |
| `CliLocal` | `open(options): E<LocalSession>` | Strict TaskQueue, persistence and executor layers | Existing compatibility queue/downloader owners and borrowed SQLite handle |
| `CliProbeProcess` | `start(spec, sink): Effect.Effect<ProcessStart, HostFailure>` | Delegates to native `DownloadProcess` | Raw probe spawn/events/direct-child signal adapter |
| `CliProbe` | `run(options): E<ProbeResult>` | Capture reducer over `CliProbeProcess` | None |
| `CliVersion` | `read(candidates?): E<CliVersionInfo>` | Files and executing-artifact-relative path calculation | None |
| `CliUpgrade` | `check(input): E<UpgradeCheckResult>`; `cachePath: E<string>` | HTTP/files/clock and existing cache policy | None |

Reuse `DownloadFiles` and its native `DownloadFilesLive` layer rather than adding a synchronous file service. Its public contract is in `packages/downloader-core/src/DownloadFiles.service.ts`; the layer reads bytes with BOM-preserving UTF-8 decoding and maps access failures to false (`DownloadFiles.layer.ts:18–35`). For printed filesystem diagnostics, unwrap the original `PlatformError` cause rather than printing a platform wrapper message.

Confirmed public leaves are `effect/http/*`, `effect/process/*`, `effect/FileSystem`, `effect/Path`, `effect/Stdio`, `effect/Clock`, `effect/DateTime`, `effect/SchemaIssue` and `effect/sql/SqlClient`. `@effect/platform-node/NodeServices.layer` supplies filesystem, path, stdio, terminal and child-process services. It supplies neither an HTTP client, a home-directory operation nor a process-exit service (`node_modules/@effect/platform-node/src/NodeServices.ts:32–50`).

### Host inputs

The proposed host contract includes these composition inputs:

```ts
interface CliHostInputs {
  readonly platform: string
  readonly homeDirectory: string
  readonly executingArtifactUrl: URL
}
```

The host entry computes `homeDirectory` with `homedir` from `node:os`, the same call currently used by descriptor defaults at `C/transport/descriptor.ts:59` and cache defaults at `C/local-info/upgrade.ts:149–150`. It provides that value through `CliHost`. An absent HOME does not become an empty home or a new configuration error: Node can obtain the home from the operating system.

Environment reads retain their existing call-time behavior. Explicit home inputs remain injectable for tests. The process does not acquire a new facility for changing its own environment.

Temp allocation uses installed filesystem temporary-directory support; executing-artifact URL conversion uses `Path.fromFileUrl`. Neither requires another host adapter. Preserve the old version candidate locations relative to the executable artifact, rather than resolving them relative to the new host source file.

### Effect CLI and the scanner

The installed `effect/cli` cannot reproduce the global lexical protocol.

The source inventory and independent review probed `Command.make`, `Flag.Boolean`, optional `Flag.String`, variadic `Argument.String` and `Command.runWith`.

| argv | Current parser | Installed Effect CLI |
| --- | --- | --- |
| `--unknown u` | Preserved yt-dlp tail | Parse failure |
| Repeated `--vidbee-pretty` | Accepted, true | Parse failure |
| `--vidbee-pretty=false` | `UNEXPECTED_VALUE`, exit 2 | Accepted, false |
| `--vidbee-api --vidbee-pretty` | API value is the second token; pretty remains false | Parse failure |
| `--help` | Download tail | Built-in help with default configuration |
| `-- --help` | Both tokens retained in tail | Does not reproduce the original token result in the tested command |

`CliConfig.layer({ builtIns: [] })` removes built-in commands, but it does not make the parser accept this protocol. `Command.runWith` still calls help presentation on parsing failure even with `renderErrors: false` (`node_modules/effect/src/cli/Command.ts:3743`). The presenter can be replaced, but suppressing output does not fix acceptance or parsed values.

The colon-command tails were examined independently, with built-ins disabled. `Flag.Int`, rather than the nonexistent `Flag.Integer`, is the installed integer constructor.

| Subcommand | Current argument grammar and checked examples | Effect CLI result | Can it own this parsing with exact acceptance, values and envelopes? |
| --- | --- | --- | --- |
| `:status` | Ignores all tail tokens, including `junk --help` | A no-argument command rejects extra operands/unknown flags; an ignored variadic tail still rejects flag-looking tokens | No |
| `:version` | Exact local fast path; ignores every tail token | Extra operands or flag-looking tails are rejected by the tested definitions | No |
| `:upgrade` | Duplicate `--force` accepted; only bare `--force`; last cache wins; `--cache --force` consumes `--force` as the path; `--cache=` accepts empty | Duplicate Boolean flag fails; `--force=false` succeeds; a flag-looking cache value fails | No |
| `:download list` | Status membership; `--group`/`--group-key` aliases; parent/cursor strings; last duplicate wins; values may look like flags; limit uses positive finite `parseInt` | `--limit 2junk`, duplicate scalar flags and `--group --limit` fail in direct definitions | No |
| `:history list` | Same parser as download list; no terminal-status filter added | Same differences as download list | No |
| `:download status` | First tail token is ID if truthy, including `--reason`; extra tokens ignored; missing/empty ID returns the existing usage envelope | String operand treats flag-looking IDs as options; first-ID-plus-tail definitions retain flag and error differences | No |
| `:download logs` | Same ID grammar as status | Same differences | No |
| `:download cancel` | Same ID grammar; capability checked after ID | Same parsing differences | No |
| `:download resume` | Same ID grammar; capability checked after ID | Same parsing differences | No |
| `:download retry` | Same ID grammar; capability checked after ID | Same parsing differences | No |
| `:download pause` | First token is ID; scans the complete tail for the first `--reason` or `--reason=`; ignores unrelated tokens; missing reason value means undefined | Declared operand/flag parsing rejects junk and duplicate reason flags; ordinary scalar parsing does not reproduce first-match scanning | No |
| `:history remove` | Requires at least one tail element, but accepts empty-string IDs and flag-looking IDs; removes sequentially | Minimum cardinality can fix zero-ID acceptance, but flag-looking and empty-ID behavior still differs | No |
| `:rss` | Ignores tail and returns the fixed not-implemented envelope after connection | Direct definitions reject extra tokens; catch-all definitions retain flag-looking-token differences | No |
| Unknown command or download/history verb | Existing command-specific envelope, after connection | Command-tree rejection occurs during parsing with different errors and presentation | No |

Slash routing also belongs to the pure calculation. `dispatchSubcommand` splits on `/`, drops empty segments, selects only the first verb segment and can ignore later slash segments (`subcommands/index.ts:63–98,156–166`). A conventional subcommand tree does not reproduce that behavior.

String flags with custom numeric mapping can reproduce `parseInt` conversion after a value is accepted. They do not repair duplicate handling, flag-looking value consumption, first-error order or the enclosing error envelope. Passing all tokens through a variadic operand and invoking the old scanner in a handler would leave the scanner owning parsing.

The scanner therefore stays in `parser/index.ts`, rewritten as a pure schema-backed calculation. Dispatch is an Effect program over its decoded invocation. Preserve original command spelling and tail tokens.

No synthetic argv or encoded payload passes through Effect CLI. None of the existing command families gives it real user-facing parsing to own with identical results. The unit imports no `effect/cli` modules and adds no separate CLI dependency. `effect` remains a dependency for the program and services.

### Client and lifecycle declarations

These proposed declarations distinguish wire IDs from local/domain IDs. `WireTaskId` is derived from an `S.Unknown` schema; `LocalTaskId` is the existing string domain type.

```ts
type WireTaskId = unknown
type LocalTaskId = string

interface EffectContractClient<Id = WireTaskId, TaskValue = unknown> {
  readonly list: (input: ListInput) => E<{
    items: ReadonlyArray<TaskValue>
    nextCursor: unknown
  }>
  readonly get: (id: Id) => E<TaskValue>
  readonly stats: E<unknown>
  readonly removeFromHistory: (id: Id) => E<void>
  readonly add?: (request: AddTaskRequest) => E<{
    id: Id
    task: TaskValue
  }>
  readonly cancel?: (id: Id) => E<void>
  readonly pause?: (id: Id, reason?: string) => E<void>
  readonly resume?: (id: Id) => E<void>
  readonly retry?: (id: Id) => E<void>
}

interface AutomationSession
  extends EffectContractClient<WireTaskId, unknown> {
  readonly handshake: E<HandshakeWire>
  readonly ensureToken: E<string>
}

interface LocalSession
  extends EffectContractClient<LocalTaskId, Readonly<Task>> {
  readonly shutdown: Effect.Effect<void>
}

interface Connection {
  readonly client: EffectContractClient<WireTaskId, unknown>
  readonly shutdown: Effect.Effect<void>
}

interface EnqueueOptions {
  readonly client: EffectContractClient<WireTaskId, unknown>
  readonly request: AddTaskRequest
  readonly wait: boolean
  readonly waitTimeoutMs?: number | null | undefined
}

interface LauncherSpec {
  readonly command: string
  readonly argv: ReadonlyArray<string>
}
```

The local connection adapter supplies the common client without pretending that the automation client returns a domain task. Actual local command IDs are scanner strings; local admission returns validated string IDs and tasks. Narrow only at the local/domain operation. Do not stringify HTTP IDs, decode them as strings, or reuse a domain-ID schema for the automation add/get/poll sequence.

Wire tasks remain unknown through polling and formatting. Property extraction preserves today’s access, truthiness, status comparisons and omission behavior; it does not impose a full task decoder. The returned task’s ID is passed unchanged to subsequent polling requests.

Token state remains per session. A supplied token’s infinite freshness is represented as a tagged supplied-token state, rather than putting Infinity in a finite numeric field. Preserve the distinction between an absent token, an empty token and a nonempty supplied token. Concurrent renewals remain concurrent; no single-flight lock is added.

The probe process contract reuses `ProcessSpec`, `ProcessStart`, `ProcessSink` and observation types from downloader-core. `DownloadProcess.start` returns `Acquired` or `NativeSpawnFailure`; `ProcessRun` exposes PID and child/group/PID/tree signal operations (`packages/downloader-core/src/DownloadProcess.service.ts:8–38`).

The raw sink updates capture state before its listener returns. This preserves overflow signaling and byte-chunk decisions. It does not impose a CLI-wide Promise-timing contract.

Install finalization with Effect operators, not JavaScript `try/finally` around `yield*`. Keep existing catch/finally regions: connection acquisition occurs before command/download teardown, and teardown failures are swallowed. Queue stop remains an explicit operation; runtime disposal is not its substitute.

## 6. Side-effect surfaces

### 6.1 Database

CLI SQLite is opt-in through local-client options. Command-line `connect()` passes `{}`, so the executable defaults to memory. It does not discover or open the desktop database automatically (`transport/local-client.ts:64–91`; `transport/connect.ts:45–54`).

Keep better-sqlite3 for the local SQLite route in this phase, on the host side, as D30 and its recorded cutover require.

- Existing minimum Node is 20.
- The CLI bundle targets Node 20.
- Eager node:sqlite changes support and can add stderr warnings.
- The ratchet forbids node-SQLite imports outside db before cutover.
- Two drivers must not open the same file in one process.

The native local layer receives `SqlClient` from context. The host opens better-sqlite3 with `{ timeout: 5000 }`, executes `TASK_QUEUE_DDL_V1`, and uses the existing borrowed-handle adapter/runtime. `releaseHandle` precedes the host’s owned close.

| Operation | SQL/transaction policy |
| --- | --- |
| Local initialization | Existing task DDL batch; no new enclosing transaction |
| Adapter setup | WAL, synchronous NORMAL, foreign_keys ON, in the existing shared best-effort try |
| Task insert | Existing columns and JSON values; `BEGIN IMMEDIATE` |
| Task upsert / batch upsert | Existing conflict update plus progress update; `BEGIN IMMEDIATE`; batches sequential |
| Task deletion | Existing child traversal, attempt deletion and task deletion; `BEGIN IMMEDIATE` |
| Progress | Existing update, including SQLite `strftime('%s','now') * 1000`; no added transaction |
| Attempt insert | Count attempts, then insert; no new transaction around the pair |
| Attempt close | Existing endedAt/code/category/tails update |
| Journal append | Existing timestamp/op/task/attempt/PID/start/code/signal insert |
| Reads | Existence projection; all tasks plus earliest attempt time; latest attempt; unmatched spawn journal rows ordered by sequence |
| Maintenance | Delete aged journal rows; best-effort `wal_checkpoint(TRUNCATE)` |
| Shutdown | Existing queue stop, adapter release/close and explicit close attempt; errors remain swallowed |

Statements remain owned by `packages/task-queue/src/persist/Sql.ts` and `TaskPersistence.layer.ts`. Do not copy them into CLI.

Reuse query-shaped row schemas and queue persisted codecs. Transactions contain SQL and pure work only. Compatibility driver failures are unwrapped through the existing db/queue bridge. Test borrowed-handle and node clients in separate processes.

The current SQLite path creates a temporary directory even when `sqlitePath` is supplied. Normal shutdown removes that directory and preserves the supplied database path. Initialization failures can leave resources behind; section 11 records that behavior.

### 6.2 Spawn sites

| Site | Command/argv | Environment and I/O | Timeout and kill policy |
| --- | --- | --- | --- |
| Probe, `download/probe.ts:48–145` | Explicit path, else trimmed nonempty `YTDLP_PATH`, else `yt-dlp`; exact parsed tail | Inherited environment/cwd; attached; stdin ignore, stdout/stderr pipe; no shell | No deadline; stdout overflow requests direct-child SIGTERM; no escalation/tree kill |
| macOS autostart, `transport/autostart.ts:117–118` | `open -ga VidBeep --args --background --from-cli` | Inherited env/cwd; all stdio ignored; detached, windowsHide true, unref | Poll budget only; launcher is not killed |
| Windows autostart, `:120–124` | `cmd /c start "" VidBeep --background --from-cli` | Same explicit options | Same |
| Linux autostart, `:126–127` | `vidbee-desktop --background --from-cli` | Same explicit options | Same |
| Local queued download, `transport/local-client.ts:96–109` | Existing YtDlpExecutor; rawArgs precedence unchanged | Resolver callbacks read `YTDLP_PATH`/`FFMPEG_PATH` without probe-path trimming; default directory `~/Downloads/VidBeep` | Existing downloader/queue cancellation and shutdown policies |
| Delegated process control | Existing downloader/tree/recovery helpers | Existing platform-specific policies | Unchanged in the host route |

Probe reduction is exact:

- Default stdout cap is 32 MiB; stderr tail is 64 KiB.
- Accept a stdout chunk only if the entire chunk fits. Discard the entire crossing chunk.
- Mark overflow before requesting TERM. Ignore subsequent stdout.
- Continue retaining stderr’s last bytes.
- First raw error or close settles the result.
- An error before close wins over the overflow diagnostic.
- Close after overflow yields `PROBE_OUTPUT_TOO_LARGE`.
- Otherwise concatenate stdout bytes once and decode; concatenate retained stderr bytes and decode. Preserve replacement characters and BOM.
- Null close code becomes -1.
- A nonzero probe result produces executable exit 1 while its envelope remains `ok: true`.
- No queue admission or history write occurs.

The native layer delegates to `packages/downloader-core/src/Process.driver.ts`. That implementation uses `ChildProcess.make` and the stock spawner, drains stdout/stderr alongside exit observation and emits native outcomes. It does not invent raw Node errors, nullable close codes or killed state.

The installed APIs support `ChildProcess.make(command, argv, options)`, explicit stdin/stdout/stderr, detached, windowsHide, env, extendEnv, cwd, killSignal and forceKillAfter. Handles expose `pid`, byte streams, `exitCode`, `isRunning`, `kill` and `unref` (`node_modules/effect/src/process/ChildProcessSpawner.ts:86–180`). The native launcher sets every relevant option explicitly.

The host probe adapter retains raw events and direct-child signaling, including the production spawner’s swallowed kill errors (`download/probe.ts:141–145`). The host launcher retains spawn/unref without scope cleanup that kills the detached desktop. The asynchronous launcher-error stack is not a byte contract; its failure, stderr and nonzero exit are.

A signal terminating the CLI itself does not run a new cancellation path. Child behavior stays as specified in section 6.5.

### 6.3 Network requests

| Request | URL/body/headers | Deadline/retry | Body and validation |
| --- | --- | --- | --- |
| Handshake | POST `<base>/automation/v1/handshake`, `{}` | Default 30 s per request; no handshake retry | Read full text; invalid/empty JSON becomes null; validate token/expiry |
| List | POST `…/list`, list input | One retry after 401 and token renewal | `tasks` array projection; absent/non-array becomes empty; cursor nullish default |
| Get | POST `…/get`, `{id}` with the original wire ID | Same | Falsy body means task-not-found; unwrap `task` if present |
| Add | POST `…/add`, full request; then separate get | Each request has its own deadline/401 rule | Read id without narrowing, then fetch task |
| Cancel/resume/retry/history removal | POST corresponding route, `{id}` | Same | Ignore successful body |
| Pause | POST `…/pause`, `{id,reason}` | Same | Undefined reason omitted in serialization |
| Stats | GET `…/stats`, no body | Same one-401 retry; distinct fixed failure message | Return parsed JSON unchanged |
| Upgrade | GET `https://registry.npmjs.org/@vidbee/cli/latest` | 5 s; no retry | Existing status check, JSON syntax and string-version check |

Automation headers are `Accept: application/json`, optional `Authorization: Bearer <token>`, and POST `Content-Type: application/json`. Upgrade supplies `accept: application/json`. Base handling removes exactly one trailing slash and concatenates the route. Do not replace it with URL-base resolution or structured query construction.

There are no CLI requests to health, events, setMaxConcurrency or setMaxPerGroup despite the client file’s introductory route list.

Use `HttpClient.HttpClient` supplied by `FetchHttpClient.layer`. Construct requests with `HttpClientRequest.get`, `post`, `bodyText` and explicit headers. Serialize POST objects through the Unknown JSON codec, preserving key order and omitted undefined fields. No compatibility HTTP driver is retained.

The installed behavior is concrete:

- `HttpClient.make` constructs a URL and normally creates a client span (`node_modules/effect/src/http/HttpClient.ts:820–915`).
- Trace propagation is enabled by default and adds compact B3 `b3` and W3C `traceparent`.
- Provide `HttpClient.TracerPropagationEnabled` as `false` for the entire CLI HTTP operation, including handshake and retry. This leaves spans available without adding those headers (`HttpClient.ts:3038–3058`).
- The fetch backend merges optional `FetchHttpClient.RequestInit` headers, removes a supplied content-length, and passes method, headers, body and signal to fetch (`FetchHttpClient.ts:108–148`).
- Supply no default RequestInit headers. Do not install status filtering, retry middleware, cookies, a user-agent transform or Effect redirect middleware.
- Runtime fetch retains its ordinary defaults, including redirects and its own transport headers. Compare old and new under the same Node runtime.

The source inventory’s fetch-reference probe observed `content-type`, `accept`, `b3` and `traceparent` by default. With propagation disabled, only the two explicitly supplied application headers remained. The tested URL preserved repeated path slashes and `%2f` query spelling. An in-memory body representation is outside the executable boundary; sent body bytes are the comparison target.

Test actual wire method, request target, header names/values and order, and body bytes. A JavaScript RequestInit comparison is insufficient. Include credentials, query/fragment delimiters, percent escapes, Unicode, trailing slashes and unusual accepted base URLs. Any URL or header serialization difference found by that test is a parity failure to resolve, not an implicit change authorized by choosing Effect HTTP.

`HttpClientResponse.text` reads the complete body and wraps read failures with their original cause (`HttpClientResponse.ts:452–454,487–503`). Its default `TextDecoder` strips a leading UTF-8 BOM, matching the old fetch `text()` and `json()` boundaries. Descriptor files use the separate BOM-preserving reader.

`HttpClientResponse.toWeb` returns an Option for fetch responses and transfers body ownership (`:125–152`). Consume the Effect response body first; then obtain statusText from the underlying consumed Web response without reading the body again. Do not hand off an unread body and continue using the Effect reader.

Each request deadline covers transport and body consumption. Apply `HttpClient.withScope` to the client, and execute each request/body operation in an owned scope. Closing the scope aborts pending requests and open response bodies (`HttpClient.ts:2785–2818`). The deadline branch maps to the characterized default-abort diagnostic, rather than printing an Effect TimeoutError. Transport/body failures derive text from their retained causes. Tests distinguish deadline expiration, program interruption, fetch rejection and body-read rejection.

Automation malformed/empty JSON remains null. Registry malformed JSON remains failure with the schema issue text in section 9. Do not use the installed response’s convenience JSON getter: it treats empty text as null (`HttpClientResponse.ts:438–440`), whereas the old registry `Response.json()` rejects empty text. Read text, then decode with `S.fromJsonString(S.Unknown)`.

### 6.4 Files

| Site | Reads/writes and retained semantics |
| --- | --- |
| Descriptor | Explicit override first; environment override next; platform defaults afterward; UTF-8 read preserves BOM; no descriptor writes |
| Version | Three ordered package candidates relative to the executing artifact; exact package name and string version; failures continue; fallback `0.0.0-dev` |
| Upgrade cache | Platform cache path; malformed/invalid data misses; recursively mkdir parent, then direct truncating write; both write failures swallowed |
| Local SQLite | Temp directory `vidbee-cli-` under host tmp; database path as above; recursive forced removal during shutdown |
| Local downloads | Existing queue/downloader writes and verification; no new CLI output writer |

Descriptor defaults retain `VidBee/automation.json`. Cache defaults retain `VidBee/cli-upgrade-check.json` on Windows/macOS and `vidbee/cli-upgrade-check.json` on Linux. Their trimming and empty-string rules differ and stay different.

`resolveDescriptorPath` uses truthy overrides and trimmed environment defaults (`transport/descriptor.ts:47–75`). `defaultCachePath` uses `??`, so empty XDG/LOCALAPPDATA values remain meaningful (`local-info/upgrade.ts:149–159`). Both receive the home computed by the host’s `homedir()` call.

Use fresh `ConfigProvider.fromEnv({ preserveEmptyStrings: true })` where live configuration is read; the provider snapshots its environment when constructed (`node_modules/effect/src/ConfigProvider.ts:1209–1219`). Path calculation uses the contextual `Path` service. Preserve executing-bundle-relative version candidates after the entry moves into the host.

Use native `FileSystem` operations through `DownloadFiles`. Asynchronous scheduling is permitted; read/write paths, contents, ordering and failure handling remain observable. No atomic writer, fsync, chmod, retry or rollback is introduced.

### 6.5 Timers, clocks and process lifetime

| Site | Purpose/default | Mapping |
| --- | --- | --- |
| Automation request timeout | 30,000 ms per request through body consumption | Native scoped request deadline |
| Token expiry check | Clock sampled during ensureToken; slack 60,000 ms | `Clock.currentTimeMillis`; same comparison |
| Autostart delay | 200 ms polling | `Effect.sleep` |
| Autostart budget | Default 10,000 ms; begins after launch; final waitedMs is elapsed time | Same sampling and loop |
| Enqueue polling | Queued 1,000 ms; other active states 200 ms | Same sleep selection |
| Enqueue budget | Optional library-only waitTimeoutMs; null/unset unlimited | Same elapsed comparison after status checks |
| Registry timeout | 5,000 ms through body parsing | Native scoped request deadline |
| Cache freshness | 30 days, strict `<`; future timestamps remain fresh | Same clock calls |
| Registry fetchedAt | Sample after successful response parse | Native clock at the existing semantic point |
| cachedAt rendering | Milliseconds to UTC ISO | DateTime conversion/formatting; preserve finite out-of-range failure |
| Local queue/downloader | Existing idle/retry/watchdog/escalation timers | Existing owner layers |

There is no CLI interval. `--vidbee-timeout` affects desktop readiness only. It does not bound probes, HTTP calls or download waits.

#### Normal completion and output

Output goes through Effect `Stdio`, including the terminal stderr fallback. The program owns the trailing newline.

The default Node stdio sinks use `endOnDone: false` (`node_modules/@effect/platform-node-shared/src/NodeStdio.ts:43–66`). The writable sink respects backpressure, but with that default its completion does not establish final stream completion. A final write that returns true can still be buffered.

The executable sends its final stdout stream through `stdio.stdout({ endOnDone: true })` and awaits completion. If a stderr fallback is needed, it sends that final stream through `stdio.stderr({ endOnDone: true })` and awaits completion. Do not end a stream before its final message. `NodeSink.pullIntoWritable` waits for drain, tracks writable errors, and, with endOnDone enabled, calls `end()` and awaits its `finished` completion (`NodeSink.ts:105–205`).

The host entry runs one fully provided, scoped terminal Effect with `Effect.runPromiseExit`. That Effect returns the computed numeric CLI exit code after command teardown and final output completion. Deliberate terminal fallback handling is inside the Effect so the fallback’s stderr sink also completes before it returns. A failed stdout sink follows the existing terminal-failure policy; if stderr also fails, terminal handling returns a nonzero code without trying to write recursively.

`Effect.runPromiseExit` returns an `Exit` without converting failure to a rejected FiberFailure (`node_modules/effect/src/Effect.ts:18841–18844`). Its implementation starts a fiber and resolves from an exit observer; it installs no process signal handlers (`internal/effect.ts:5773–5800,5854–5868`). The entry inspects that Exit, sets `process.exitCode` to the returned CLI code, or 2 for a residual terminal failure, and calls `process.exit(process.exitCode)` only after the terminal Effect has completed. This retains explicit executable termination rather than waiting indefinitely for compatibility-owner handles. It adds no console logging or automatic Effect failure report.

A slowly read pipe must receive the complete document and newline before a normal exit. A closed pipe cannot receive bytes it refuses: that case terminates with nonzero status and a completed stderr diagnostic when stderr remains writable. Do not hang waiting for drain after a stream has failed. If stderr is also closed, require bounded nonzero termination; delivery to a closed destination is impossible.

The old entry calls `process.exit` immediately after `write` (`C/bin.ts:14–27`). Full output completion is an architect-directed requirement, including where the old executable truncates output. Section 9 records this exception; the oracle does not silently normalize or ignore it.

#### SIGINT and SIGTERM

The executable installs no SIGINT or SIGTERM handler. Preserve Node’s default signal termination:

| Signal delivered to the CLI | Child-process observation | POSIX shell status |
| --- | --- | ---: |
| SIGINT | Exit code null, termination signal `SIGINT` | 130 |
| SIGTERM | Exit code null, termination signal `SIGTERM` | 143 |

`C/bin.ts:12–29` runs the Promise program and exits on normal completion or rejection; it has no signal registration. The probe and autostart paths likewise add no parent signal handler. A signal therefore terminates the process without first interrupting an Effect fiber, running queue shutdown, flushing a pending output document or issuing new child/group/tree cleanup requests. Children receive only what today’s OS/process-group circumstances deliver. A parent-only signal is not turned into a child signal by the port.

Do not use `NodeRuntime.runMain`, `Runtime.makeRunMain`, a signal-to-AbortSignal adapter or another helper that installs signal handlers. Installed `NodeRuntime.runMain` registers the same callback for SIGINT and SIGTERM, remembers only a Boolean and interrupts the fiber before teardown (`node_modules/@effect/platform-node-shared/src/NodeRuntime.ts:60–85`). It cannot supply this contract through a custom numeric teardown alone.

Normal output completion and signal termination have different guarantees. Await the final sinks before a normal explicit exit. An externally terminating signal may interrupt any write, exactly as today; no flush or final envelope is promised after that signal.

The byte oracle delivers each signal during HTTP-body consumption, probe execution, autostart polling and local queue work. It compares raw output, exit code, termination signal and child observations with the reference. The same contract is an obligation of the phase-10 strict entry.

## 7. Pure modules

The rule set changes implementation form, not successful pure results:

- Replace reserved/probe/redaction/value-consuming native collections with Effect collections. Preserve encounter order explicitly where exposed; do not assume HashMap iteration matches Map.
- Use Effect array/string helpers without changing truthiness, coercion or token consumption.
- Add pipeable overloads where required, retaining existing data-first calls. Test optional-argument dispatch.
- Use schema JSON serialization for `renderEnvelope`; compact and pretty output must match the old bytes.
- Preserve URL redaction’s return-original-token-if-unchanged rule. URL normalization happens only after a substitution.
- Preserve command-preview quoting, empty-token handling and the probe command’s different simple space join.
- Preserve best-effort URL guessing and output hints, including incomplete flag knowledge.
- Keep `compareSemver`’s parseInt-based algorithm.
- Use Uint8Array-compatible byte capture with Node-oracle tests; strict code needs no Buffer import.
- Preserve the numeric scanner algorithms: maxAttempts checks canonical decimal rendering; timeout and list limit use finite positive `parseInt` results.

The direct-module `PROBE_FLAG_REGISTRY` exposes Sets today, but no package entry exports it and no outside importer was found. Its internal representation can change without retaining a native collection API.

The package obeys the full diagnostics: no async functions, global timers/date/JSON/random/fetch/console, direct process environment reads, Node built-in imports, native collections, diagnostic overrides, suppressions or `any` escape casts. Promise adaptation belongs only in genuine third-party drivers. Runtime execution belongs in recognized entrypoints.

The candidate global `process.kill(pid, 0)` driver is qualified under section 12.8. Its presence is not an exemption from any diagnostic.

There is no CLI microtask compatibility layer. The pure differential oracle compares results and required failures, not Promise turns.

## 8. The host package and wiring

`@vidbee/cli-legacy` is private, unported and temporary. Its scope is fixed by section 2.

| Strict service supplied by host | Host implementation | Reason and observable boundary | Evidence |
| --- | --- | --- | --- |
| `CliHost` home input | Entry calls `node:os.homedir()` and provides its result | Environment lookup alone loses the OS fallback when HOME is absent; installed NodeServices and Path have no home-directory operation | `C/transport/descriptor.ts:59`; `C/local-info/upgrade.ts:149–150`; installed `NodeServices.ts:32` |
| `CliLocal` | Existing TaskQueueAPI and YtDlpExecutor owners, memory/borrowed SQLite persistence, client projection and explicit shutdown | Native downloader/process acquisition, output delivery, signaling and cleanup still differ; these justify retaining the executable’s existing owner composition | Downloader design section 6; current process layers; `docs/effect-port/OWNER-REVIEW.md:75`, row 67 |
| `CliProbeProcess` | Raw spawn, original byte chunks/error/close observations, direct-child TERM | Native acquisition failure returns PlatformError without a child; native completion lacks nullable raw close/signal; rechunking can change whole-chunk cap decisions; native control can spawn helper commands instead of making the same child signal call | `packages/downloader-core/src/DownloadProcess.service.ts`; `Process.model.ts`; installed `NodeChildProcessSpawner.ts:436–466,478–500`; downloader design’s native difference table |
| `CliLauncher` | Detached Node spawn with ignored stdio, windowsHide and unref | Stock acquisition/error handling and scoped cleanup differ; scope finalization can terminate detached-group members, changing launcher/descendant lifetime | `C/transport/autostart.ts:66–89`; installed spawner acquisition/finalization; downloader design section 6 |
| `CliPidLiveness`, conditionally | Exact global signal-zero call, only if strict qualification fails | Preserves the existing arbitrary-PID probe without process-list/file observations; the diagnostic rejecting the strict driver must be named | Section 12.8; `C/transport/descriptor.ts:163–175` |

Owner-review row 49 records native-kernel reentrant cancellation during synchronous start and pause before asynchronous start first suspends (`docs/effect-port/OWNER-REVIEW.md:57`). It explicitly says “no application path yet.” These are dependency obligations retained until phase 9.1, not executable characterizations or an additional reason to emulate callback timing in CLI. `connect()` supplies `factory({})` (`C/transport/connect.ts:45–50`), and separate local invocations own separate memory queues; a second cancel/pause invocation cannot control the first invocation’s queue.

HTTP, files, output and polling remain native. The named home input and conditional liveness capability do not authorize a general compatibility host service.

The existing downloader compatibility process layer is an implementation reference: `packages/downloader-core-legacy/src/Process.layer.ts` retains original byte chunks, raw error/exit/close and child signaling. The CLI probe adapter preserves its own swallowed-kill-error policy and adds no downloader tree cleanup.

### Native layers shipped now

- `CliLocal` native composition uses `TaskQueue`, `TaskPersistence`, `TaskExecutor` and the native downloader layers. It maps `retry` to `TaskQueue.retryManual`, preserves list projection and explicitly calls `stop`.
- `CliProbeProcess` native composition delegates to downloader-core `DownloadProcess`.
- `CliLauncher` native composition uses the contextual spawner and `ChildProcess.make`, with explicit options and `handle.unref`.
- Descriptor logic uses native files and paths with the supplied home input and the qualified liveness capability.

Native tests assert native outcomes honestly. Missing raw observations are not fabricated to make those tests look like compatibility tests.

### Entry and artifact wiring

The host’s `src/entry.ts` composes and runs the strict program by the handler-free procedure in section 6.5. A recognized strict entry module defines the eventual native composition. Do not place runtime execution in `src/bin.ts` and assume the ratchet recognizes that filename: `scripts/port-check.mjs` recognizes `index`, `main`, `entry`, `cli` and `*.entry` filenames.

`apps/cli/scripts/build.mjs` remains JavaScript. Its executable entry resolution changes, but it keeps:

- `apps/cli/dist/index.mjs`.
- `apps/cli/dist/bin/vidbee.mjs`.
- The `#!/usr/bin/env node` shebang.
- The existing npm-bin shim, including its caught-import-error formatting.
- Node 20 targeting and required externals.

The shim’s generated JavaScript contains the `'\n'` string escape constructed at `apps/cli/scripts/build.mjs:44–50`. Preserve its actual emitted bytes; do not repair its fallback while changing entry wiring.

The library and executable use distinct outputs:

| Public surface | JavaScript target | Declaration target |
| --- | --- | --- |
| `.` | `dist/library/index.js` | `dist/library/index.d.ts` |
| `./parser` | `dist/library/parser/index.js` | `dist/library/parser/index.d.ts` |
| `./envelope` | `dist/library/envelope/index.js` | `dist/library/envelope/index.d.ts` |
| Executable | `dist/index.mjs` | Not a library declaration entry |
| `bin.vidbee` | `dist/bin/vidbee.mjs` | Not applicable |

Workspace conditions may resolve the three library entries to source during development. Published exports, `publishConfig.exports`, `main` and `types` resolve to the corresponding built library targets. The bin continues to resolve to the shim.

The current build deletes all of `dist` at `apps/cli/scripts/build.mjs:25`; running it after declaration emission would erase declarations. Replace that orchestration with this sequence:

1. Clean `apps/cli/dist` once, before either build, including incremental build state.
2. Run the strict library build with `tsrs`, emitting JavaScript and declarations under `dist/library`.
3. Bundle the host entry to `dist/index.mjs` and emit the existing shim under `dist/bin`, with no second clean.
4. Run distribution verification after both builds.

Distribution verification resolves all three public entries and their declaration targets from the completed publish layout with the source tree unavailable. It imports the built library entries, checks the declaration resolution with a separate consumer configuration, and invokes both executable paths. A check for the two executable files’ existence is insufficient.

### Ownership

- One CLI execution owns its Effect program scope.
- Raw process callbacks enter the owning scope/runtime through the host bridge.
- Existing local TaskQueueAPI/downloader owners retain their private runtimes.
- The SQLite handle uses the existing borrowed runtime; release precedes owned close.
- Teardown invokes existing shutdown behavior.
- Normal explicit process exit follows terminal output completion.
- OS signal termination invokes no new Effect cleanup or child cancellation.
- No per-request runtime or second queue/database owner is introduced.
- Internal microtask timing is not an additional CLI obligation.

### Workspace wiring

- Strict CLI uses catalog Effect/platform/test/compiler pins and `workspace:^` strict packages.
- Host depends on strict CLI, existing compatibility owners and its required host dependencies.
- better-sqlite3 remains optional and lazily required. Parser/version/probe startup must not require the addon.
- Both packages join root checks/tests. Strict CLI receives source/test configs, tsrs and Biome scope. Host receives explicit typechecking and compatibility tests without strict inheritance.
- Strict test configuration disables composite/incremental/declaration output and uses noEmit, as the port guide requires.
- No existing CLI test globs need moving. Add the permanent oracle and host tests to root test wiring.
- Root Biome inclusion adds the strict CLI unit, not the repository-root oracle fixture.
- Desktop `bundledWorkspacePackages` gets no CLI entry. Desktop does not import or bundle CLI (`apps/desktop/electron-builder.yml:120–122`).
- CLI esbuild inlines strict and host workspace dependencies and preserves required externals.
- The CLI package’s publication allowlist remains `dist`, `README.md`, `CHANGELOG.md` and `LICENSE`; it includes no repository-root fixtures.
- Do not use generated JavaScript as an exemption for domain logic.

### Recorded exit condition

Phase 9.1 resolves the native kernel and native process obligations, including owner-review rows 49 and 67 and the retained app-output-pipe packaged case. Native-kernel callback obligations remain dependency tests; they are not described as executable paths.

The executable then switches composition to strict native layers. Before phase 10 removes the host, the strict entry also provides the home-directory capability, preserves exact PID liveness, and follows the handler-free runtime and signal contract. Reaching a phase number alone is not proof of parity.

The permanent fixture remains owned by the repository’s CLI parity tests after host deletion. The byte oracle and packaged goldens judge the transition. Any remaining executable difference is enumerated and recorded as a declared change at that cutover.

## 9. Deliberate changes

No command syntax, help/usage output, normal envelope, transport selection, redaction rule, autostart policy, signal policy or local queue behavior is deliberately changed.

The recorded changes are:

1. **Unused library execution APIs become Effect APIs.** The three export entries stay. Pure helpers keep their signatures; schema-derived types, Effect operations and services replace unused Promise/callback execution APIs and native error constructors. No Promise facade is retained. Publication metadata exposes the strict library entries instead of treating the published root as executable evaluation; bin paths remain unchanged.

2. **Non-finite normalized descriptor numbers use field-specific rejection/defaulting.**

   | Field substituted with JSON `1e999` or `-1e999` | Old result | New result |
   | --- | --- | --- |
   | `port` | Accepted as ±Infinity | `DESKTOP_NOT_READY`, `descriptor missing host/port` |
   | `pid` | Accepted as ±Infinity | `DESKTOP_NOT_READY`, `descriptor missing pid/pidStartedAt` |
   | `pidStartedAt` | Accepted as ±Infinity | Same PID/start validation failure |
   | `tokenIssuedAt` | Accepted as ±Infinity | null |
   | `tokenExpiresAt` | Accepted as ±Infinity | null |
   | `updatedAt` | Accepted as ±Infinity | 0 |

   Probe each field independently in an otherwise valid descriptor. JSON exponent overflow is real: JSON syntax can produce Infinity even though JSON serialization writes non-finite numbers as null.

3. **Non-finite handshake expiry fails the existing contract check.** Previously `expiresAt: 1e999` passes the numeric check and can make the token indefinitely fresh. It now fails with `handshake response missing token/expiresAt`, following the existing HTTP-error/runtime path. Negative Infinity receives the same contract failure. Direct injected NaN receives the same new failure; it is not expressible as a JSON numeric literal.

4. **Non-finite cache fetchedAt is a cache miss.** Previously positive Infinity can appear fresh and later fail ISO formatting with `Invalid time value`; it now causes the existing miss/fetch path. Negative Infinity and NaN already miss the old cache and remain misses. Finite future timestamps remain accepted. Finite out-of-range Date timestamps retain their existing failure.

5. **Output completion precedes normal exit.** Previously immediate `process.exit` could truncate a buffered document. The port completes the final Stdio sink before normal exit. The slow-pipe case records old bytes and requires the new complete document. Closed-pipe failures require nonzero exit and stderr when available, under the stack-trace exception in section 4. This does not add flushing or cleanup before OS signal termination.

6. **Handled JSON syntax diagnostics use schema issue text.** Schema discards the engine SyntaxError. Descriptor and registry error codes, exit codes, fixed message portions and envelope structure stay; the engine-derived suffix is replaced by `SchemaIssue.makeFormatterDefault()(error.issue)`. With the selected codec and default parse options this is `Expected a valid JSON string`.

   The following strings are verified under Node 22.23.4. `\n` in the table denotes an actual newline within the message; envelope JSON escapes it normally. The BOM shown in quotes is U+FEFF.

   | Boundary and input | Old message | New message |
   | --- | --- | --- |
   | Descriptor `{` | `automation descriptor is malformed: Expected property name or '}' in JSON at position 1 (line 1 column 2)` | `automation descriptor is malformed: Expected a valid JSON string` |
   | Descriptor BOM + `{}` | `automation descriptor is malformed: Unexpected token '﻿', "﻿{}" is not valid JSON` | `automation descriptor is malformed: Expected a valid JSON string` |
   | Descriptor `{\n"x":}` | `automation descriptor is malformed: Unexpected token '}', "{\n"x":}" is not valid JSON` | `automation descriptor is malformed: Expected a valid JSON string` |
   | Registry `{` | `Expected property name or '}' in JSON at position 1 (line 1 column 2)` | `Expected a valid JSON string` |
   | Registry `{\n"x":}` | `Unexpected token '}', "{\n"x":}" is not valid JSON` | `Expected a valid JSON string` |
   | Registry BOM + `{}` | ``registry response missing `version` `` | Same |
   | Registry BOM + `{"version":"1.2.3"}` | Successful version response | Same successful version response |

   Descriptor syntax failures retain `DESKTOP_NOT_READY` and their `{ path }` details; when surfaced as that envelope they map to exit 3. Existing connection/autostart branches may mask that envelope and remain unchanged. Registry syntax failures retain `API_UNREACHABLE`, exit 3 and the fixed registry detail. Registry messages have no added textual prefix today (`C/runtime.ts:159–165`), so none is introduced. A BOM is stripped by the registry fetch text boundary and is not newly rejected. Empty registry text still fails, now with the schema issue text; empty automation text still becomes null. Cache and package syntax failures remain silent miss/fallback branches.

7. **A deadline timer that has already fired is not cleared again.** The old request helper calls `clearTimeout` on its deadline handle in a `finally` block, including after that timer has fired. The native request deadline is an Effect sleep; when it completes there is no handle left to clear. Clearing a fired Node timer has no effect, so nothing outside an injected `clearTimeout` can see the difference. The frozen observation `injected HTTP deadline lasts through body consumption` records `cleared: [1]` for the old code. The port records `cleared: []`. That case is admitted through `approved-changes.json` under `VIDBEE_CLI_PORTED=1` (section 12.13). A request whose body finishes before the deadline must still cancel the pending timer.

8. **Envelope encoding failures keep a synchronous throw, with a different error.** `renderEnvelope` accepts an unknown result field. For a BigInt or a cyclic value, the old call throws the engine `TypeError` from JSON serialization. The new call still throws synchronously, but with the Schema JSON encoding failure (`SchemaError`, `Expected a JSON-serializable value`), because the installed `SchemaGetter.stringifyJson` drops the engine cause. This is the port guide's engine-error boundary: the call must still fail, and its class and message need not match. No such value reaches the executable, because the result fields come from parsed JSON or from local task rows (section 12.14).

The phase-8 plan note says argument parsing moves to `effect/cli` and the command surface must not change. The first requirement cannot be carried out with the installed parser while satisfying the second. The scanner stays; Effect owns execution. There is no synthetic command tree.

Adopting Effect CLI’s grammar would change at least:

- Unknown yt-dlp flag passthrough.
- Duplicate flag acceptance and last-wins behavior.
- Boolean `=false` acceptance.
- Consumption of flag-looking values.
- Retention and interpretation of `--`.
- Help/version routing and parse-error presentation.
- Slash-command handling and ignored tails.
- Flag-looking and empty IDs.
- Pause’s first-match reason scan.
- Numeric suffix acceptance with ordinary integer flags.
- Connection-before-command-error ordering.

A future grammar change is an owner decision. It is not part of this port.

Items 2–4 do not authorize stricter task-response, wire-ID, semver, timestamp-range, descriptor-host or port validation. Item 6 authorizes only the named syntax diagnostic replacement. Items 7 and 8 authorize only the named timer observation and the named encoding failures. No stock native process difference is accepted by implication.

## 10. Verification the implementation owes

### Characterization before implementation

The unit has no tests today. Write characterization tests against unchanged old source first. Keep their assertions unchanged through the port. Old/new requirements in section 9 receive separate explicit expectations.

| Area | Required fixtures |
| --- | --- |
| Scanner | Every reserved flag; inline/separate/missing values; duplicate/order pairs; loose `--vidb` typos; empty tokens; colon cutoff; `--`; options consumed as values |
| Numeric parsing | maxAttempts canonical-string rule; timeout/list-limit parseInt permissiveness; zero, negatives, signs, leading zeros, whitespace, suffixes, exponent text and large values |
| Probe routing | Every exact alias/getter/meta flag; `=value`; first-match selection; flags appearing as values or after `--`; every stdout-output spelling |
| Subcommands | Slash/space forms, ignored segments/tails, missing IDs, empty and flag-looking IDs, list aliases, first reason match, sequential removal and capability absence |
| Redaction | Sensitive flags/headers/query keys, duplicates/case, malformed URLs, missing values, Unicode, quoting, text tails and unchanged-token identity |
| Envelope rendering | Compact/pretty bytes, key order, omitted undefined fields, arbitrary result values, non-finite serialization and newline ownership |
| Runtime | Every catch region, compact parse errors, API validation before local/probe/version paths, connection-before-command errors, teardown swallowing |
| Probe | Exact cap boundary and oversized chunk, byte stderr truncation, split UTF-8/BOM, error/close races, null close, missing executable and ignored TERM |
| Automation | Wire requests, expiry boundaries, supplied/empty token, concurrent renewals, one-401 retry, 403, retry failure, malformed/empty/scalar/null replies, body-read rejection, loose add/get/poll IDs |
| Descriptor/autostart | Platform/path/environment precedence, HOME absent, BOM/invalid UTF-8, read failures, exact liveness false/throw behavior, synchronous launch throw, asynchronous launch error, poll/deadline boundaries |
| Local owner | Memory/sqlite startup, missing addon, injected executor, start failure, shutdown twice, stop failure, supplied sqlite path, temp cleanup and detached teardown |
| Upgrade/version | Bundle-relative candidates, malformed files, fallback, TTL/future times, force/cache syntax, write failures, registry failures, BOM distinction, ISO range and semver quirks |
| Output lifetime | Complete small/large/pretty output, slow reader, early close before and during output, stderr fallback and both streams closed |
| Signals | Both SIGINT and SIGTERM during HTTP-body consumption, probe execution, autostart polling and local queue work; status, signal identity, bytes and child behavior |
| Distribution | One clean, complete library/declaration and executable outputs, all three export/declaration resolutions with source unavailable, both executable paths |

### Loose automation IDs

Characterize the actual add/get sequence before implementation, with a fake server returning a successful task independently of the ID’s kind.

| Add response | Required first get body | Old successful behavior to preserve |
| --- | --- | --- |
| `{"id":42}` | `{"id":42}` | Detached output can contain numeric task ID 42 |
| `{"id":false}` | `{"id":false}` | Falsy ID is sent unchanged; it is not rejected by add |
| `{"id":null}` | `{"id":null}` | Null ID is sent unchanged |
| `{"id":""}` | `{"id":""}` | Empty string is sent unchanged |
| `{}` | `{}` | Absent ID becomes undefined and is omitted during serialization |

For each case, return `{task:{id:<value>,status:"completed",attempt:1,maxAttempts:3}}` where representable, and pin the detached envelope, including omission when the task ID is absent. These are old successes, not new exceptions.

For waiting, return a queued task whose ID differs from the add response’s ID. Assert that the next get uses the returned task’s ID unchanged, including numeric, false, null, empty and absent values. Then return a completed task and assert success.

Separately return a falsy get body. Pin the current `task <id> not found` message and `UNKNOWN_ERROR`/2 runtime mapping. Distinguish this from add’s null/malformed response failing during destructuring, a truthy scalar get body failing at `in`, and a `{task:null}` response failing later during task access. Do not turn successful wire IDs into failures or unify these failure locations under a new response decoder.

The independent review’s numeric-ID vector is retained verbatim:

```text
/get request body: {"id":42}
run exit code:    0
stdout:
{"ok":true,"mode":"download","task":{"id":42,"status":"completed","attempt":1,"maxAttempts":3,"command":"yt-dlp https://example.invalid/v"}}
```

### Pure-export differential oracle

Keep an old-source reference fixture for pure exports outside scanned units alongside the executable reference. Compare it with the strict exports. Populate every model field before substituting one field at a time; then add selected interacting pairs.

Cover scanner helpers, `parseArgv`, `parseListArgs`, probe routing, transport selection and URL validation, redaction, forwarded-input construction, semver comparison and envelope helpers.

Apply the port guide’s parity boundary:

- Within declared types, preserve results and deliberate failures.
- For null, wrong-kind JSON scalars and NaN outside declared types, preserve old successful results.
- If an out-of-type call threw an engine/Node error, the replacement must fail; engine text/code need not match.
- Arrays/objects in scalar positions have no additional parity obligation.
- Deliberately constructed application errors retain their contract.

Do not add discarded operations solely to provoke the old engine error. Do not add Promise-turn markers to this CLI oracle.

### Permanent differential executable oracle

The reference is a bundle from the pre-port commit, not a rebuild from modified source.

Store the reference under the repository root:

```text
fixtures/cli-pre-port/
  index.mjs
  bin/vidbee.mjs
  package.json
  manifest.json
  LICENSE
```

This directory belongs to no ported or unported application/package unit. `scripts/port-check.mjs:29–32` discovers configuration files only under `apps` and `packages`; `:48–50` derives scan roots from the directories of ported configurations. A root `fixtures/cli-pre-port` directory is outside those roots. Do not add a unit configuration there or copy the bundle under a ported unit.

Root Biome uses an explicit `files.includes` list in `biome.jsonc`. The fixture is outside that list; adding CLI lint scope adds `apps/cli/**` and does not broaden linting to root fixtures. The CLI package’s `files` publication allowlist contains only its own `dist`, README, changelog and license. It does not publish the root fixture. Do not add a broad fixture-copy step to the library or executable build.

The reference remains unchanged, including its native Map/Set constructors. Neither the checker nor the bundle is modified to make the fixture pass. The repository’s permanent CLI parity tests own it after `apps/cli-legacy` is deleted.

The manifest records commit, lockfile hash, Node/Bun/esbuild versions, build options, byte length and SHA-256 for every retained artifact.

A read-only esbuild build with `write: false`, using the pre-port source and build options, reproduced:

```text
commit:  9dab889b0b1d5328721802d65699a5f8593bf2e2
bundle:  2,144,754 bytes
sha256:  96711ba9fa521c2aeb8d02dcccc1d45db2ebdd982ccd6118ab4e0991a9134e0f
```

This is about 2.05 MiB and is small enough to commit as the permanent reference. An existing `dist` file is not a provenance substitute for this recorded build.

Add a fixture-generation script, proposed `apps/cli/scripts/record-pre-port.mjs`, before implementation. Its procedure is:

1. Require the recorded pre-port revision and a clean detached checkout of it.
2. Use a temporary checkout under `~/YeeBois/workstation-apps/worktrees/VidBee/` when a worktree is needed.
3. Install the recorded lockfile with Bun in frozen mode, including normal prepare patches.
4. Verify pinned Node 22.23.4.
5. Run the old CLI build from that checkout.
6. Copy only the bundle, shim, package metadata and license into `fixtures/cli-pre-port`.
7. Record hashes and sizes and verify the generated bundle against the manifest.
8. Keep the old implementation immutable thereafter.

Normal tests verify fixture hashes and execute the committed reference and candidate. They do not rebuild the reference.

If repository artifact policy later rejects the fixture size, committed per-vector raw outputs and observations are generated by the same recorded-revision procedure. That fallback requires a fixed visible root, such as an isolated mount namespace exposing each per-run tree at the same path. It does not authorize arbitrary path substitution or error-text normalization. Side-by-side execution remains the selected primary design.

### Isolation and exact coverage

Each vector runs reference and candidate sequentially against the same visible paths, resetting mutable fixture state between them.

The per-run temporary root contains executable copies, package candidates, cwd, home, XDG directories, descriptor, cache, download output, temporary files and controlled executables. Pass HOME, TMPDIR, XDG_CONFIG_HOME, XDG_CACHE_HOME, XDG_DATA_HOME, XDG_STATE_HOME, XDG_RUNTIME_DIR, APPDATA, LOCALAPPDATA and `VIDBEE_AUTOMATION_DESCRIPTOR` explicitly. Supply a controlled PATH and `YTDLP_PATH`; do not inherit tokens, Node options, preload hooks or a real user profile. Set an explicit locale and TZ. Use the same Node executable for both runs.

For bundle-relative version tests, put reference and candidate in the same logical bundle location on their respective turn, with identical package candidates. For descriptor liveness, use one controlled live fixture PID shared by both runs; never record its numeric value as an expected output.

The fake automation server remains on the same endpoint for both turns and resets its response script and request log. It returns fixed IDs, task timestamps, bodies and status sequences. The controlled yt-dlp executable returns fixed bytes and exit behavior. No wall-clock timestamp, user name, real home path or ambient cwd enters deterministic output.

Use fixed cache payloads and timestamps whose freshness outcome is independent of wall-clock time, including a finite future timestamp for the ordinary cached result. Use separate injected-clock unit tests for exact TTL boundaries. Live registry success produces a real fetchedAt and is outside deterministic executable byte coverage.

The HOME-absent characterization separately verifies `homedir()` fallback without reading an owner profile. Use injected host inputs for path calculations and an isolated account/filesystem environment for executable fallback proof; clearing HOME alone on the workstation is not an isolated-profile test.

The byte oracle covers every invocation represented by the vector generator whose output is deterministic against the fake automation server, controlled yt-dlp and fixed descriptor/cache/package files. It includes parse failures, all command families, fake-server admissions/waits/mutations, deterministic descriptor failures, version, cached upgrade and controlled probe results.

It does not claim exact bytes for:

- Local admissions containing generated IDs and timestamps.
- Live registry success and its generated fetchedAt.
- Real extractor/network behavior.
- Actual elapsed-time timeout text.
- The stack-trace exceptions in section 4.

Those cases receive their own stated assertions or packaged golden projections.

Generate vectors from:

- All fourteen reserved flags, value forms and invalid forms.
- Duplicate flags and ordering pairs, particularly no-retry/max-attempts, wait/detach and local/target/api.
- Every probe flag, near miss and unknown yt-dlp flag.
- Every colon command/verb, slash spelling, missing argument and list filter.
- `--`, help/version tokens, empty/Unicode/quoted values and stdout-output forms.
- Redaction-bearing arguments.
- HTTP error/retry sequences and permissive response shapes, including loose IDs.
- Descriptor/package/cache failure fixtures.
- Both parent termination signals at the four controlled execution points.

Collect raw streams through child `close`, after pipe closure, not merely `exit`. Compare:

```text
stdout bytes
stderr bytes
exit code
termination signal
ordered HTTP requests, including request target, headers and body bytes
file read/write observations and resulting bytes
process argv/environment/signal observations
```

Run both bundles with the same temporary-root string. No normalization is needed or permitted. Report the first differing byte and retain raw evidence. Do not parse JSON before comparison.

Use the filesystem/network/process sandbox or trace harness to restrict and observe external access. Filter only harness/runtime setup from trace assertions, with that filter documented. Do not claim that a post-run file snapshot proves which files were read.

Approved finite-number and syntax-message changes have explicit old/new cases. Slow-pipe completion records reference bytes and separately asserts complete candidate output. Stack-trace exceptions compare failure/nonzero/stderr predicates, not exact diagnostic bytes. These are named exceptions, not broad normalizers.

### Signal vectors

For each signal, use a bounded readiness condition before signaling only the owned CLI PID:

| Execution point | Readiness condition |
| --- | --- |
| HTTP-body consumption | Fake server has sent headers and a controlled body prefix, with the body held open |
| Probe execution | Controlled yt-dlp has reported startup and remains running with known output |
| Autostart polling | Fake detached launcher has reported startup; descriptor remains absent/stale while polling |
| Local queue work | Controlled local executor/process has reported admission/start and remains active |

Compare `code: null` and the exact termination signal against the old bundle; assert shell statuses 130 and 143 through a shell wrapper as separate observations. Compare all bytes emitted before termination and child/group signal observations. The candidate must not add an interruption envelope, queue shutdown or child cleanup.

Children can hold inherited pipes open after the CLI dies. The harness therefore records parent exit independently, observes child survival/signals for a bounded window, and closes or reaps only its owned fixtures afterward. Final collection still waits for pipe closure. Document harness cleanup signals separately from production observations.

### Timeouts

All exhaustive and process-spawning tests have explicit limits suitable for loaded CI:

- Pure generated differential groups: 120 seconds per bounded group, with a recorded maximum vector count.
- Ordinary executable vectors: 30 seconds each.
- Slow-pipe, ignored-TERM, descendant-held-pipe, signal and autostart cases: 90 seconds each.
- SQLite lifecycle/reopen groups: 120 seconds.
- Packaged task-control cases: 180 seconds with bounded condition waits.
- Overall generated-oracle job: 20 minutes.

A fixture deliberately ignoring TERM is killed by the test harness after its assertion window. The production probe gains no deadline or escalation.

### Native-layer and host proof

Bun hosts Vitest; explicitly selected Node children establish Node semantics.

Compare host/reference observations for missing executable, error/close races, nullable close, raw chunks, overflow TERM, detached/unref lifetime and launcher failure. Native tests separately assert native acquisition failure, signal exit, output drain, rechunking and scope cleanup.

Use slow readers and early-closing readers for both direct bundle and shim. Assert full final bytes before normal successful/intentional error exit, bounded failure on closed pipes, no extra Effect logs and no unhandled writable error after cleanup.

Qualify the exact proposed `PidLiveness.driver.ts` under the strict source and test configurations, patched tsrs and `port:check`, as section 12.8 requires. Record the command, diagnostic result and driver source. Textual checker inspection alone is not proof of qualification.

A source inspection is not a substitute for these child-process or compiler tests. The independent review’s direct pipe probes support the selected Stdio mechanism; they do not establish the complete CLI gate.

### SQL and persisted data

Run local SQLite lifecycle tests against borrowed better-sqlite3 and node clients in separate processes. Verify begin modes, task/attempt/journal contents, restart recovery, unknown-key round trips, supplied path preservation and original driver errors on the borrowed route.

On a copy of relevant owner data:

- Decode descriptor and upgrade-cache files using the new codecs.
- If a persisted CLI queue exists, open only its copy and decode all queue rows/JSON columns.
- Report counts and failing schema paths only, never content, tokens or raw rows.
- If no CLI queue/cache exists, report that absence and use synthetic fixtures. Do not assume the desktop database is a CLI database.

### Pre-port golden additions

Record these on the packaged build and CLI bundle preceding this phase:

| New cases | Fixture requirement |
| --- | --- |
| Compact/pretty parse failures, reserved typo, unknown colon/verb, help routing, yt-dlp version versus CLI version | Controlled descriptor/API and yt-dlp |
| Probe success/nonzero/oversize | Deterministic executable; real loopback metadata probe separately |
| Desktop detached download and wait success | Loopback MP4, fixed headers, HEAD/range support and short output alias |
| Wait non-success, retry-scheduled and paused | Loopback failure/throttled routes and public task controls |
| Cancel/pause/resume/retry/history removal | Subscribe before admission; wait for logged transfer and positive progress |
| Local memory download/wait and detached shutdown | Explicit bundled yt-dlp/FFmpeg paths and isolated output directory |
| Local SQLite reopen | Explicit isolated database path through the local-client seam; no invented CLI flag |
| Descriptor absent/stale/no-autostart | Isolated descriptors and fake launcher |
| Upgrade cached/forced/error | Fixed cache and controlled fetch tests; real registry remains separate network proof |

The current packaged helper collects piped stdout/stderr but resolves on `exit` (`apps/desktop/scripts/port/golden/worker.mjs:93–105`). Before relying on the extended CLI cases, replace that capture path with a bounded helper that records exit code and termination signal, handles spawn/stream failures, and resolves only after stdout/stderr closure and child `close`. Include large pretty/probe output and a descendant-held-pipe timeout case. Preserve existing golden normalization and values; the capture repair does not authorize changed expectations.

Local admissions use the golden harness’s declared projections for generated IDs, timestamps, paths and progress. Record those projections with each new case; do not describe them as byte-oracle coverage.

The loopback server already supplies deterministic MP4/WAV/PNG, HEAD, ranges, failures, recovery and throttling. It also serves any HTML playlist/metadata page used by a CLI probe with explicit content type and stable linked media URLs.

Do not use fixed sleeps to cancel or pause. Use bounded condition waits and retain requests/events. Repeat the completed packaged suite five consecutive times.

### Gates and manual exercise

Run strict CLI/host checks and standalone-distribution verification, then the port-guide gates in order:

```sh
bun run port:check
bun run check
bun run test
bun run deps:check
bun run build:linux
bun run --cwd apps/cli build
bun run test:golden
```

Run package-specific strict checks before that sequence. Preserve existing fourteen CLI and 379 total golden cases except explicitly recorded approved changes.

Offline manual exercise uses an isolated synthetic profile and loopback namespace: executable/shim invocation, pretty output, metadata probe, desktop admission/wait, local download, pause/resume/cancel/retry, history removal, cached upgrade and owner-free autostart fixture. Never launch, stop or signal the owner’s application.

Remote HTTPS API success, npm registry success, real yt-dlp extractors/authentication and network-specific failures require separate network proof. Windows/macOS compile and injected command/path tests do not establish launch proof.

## 11. Behavior kept as it is

Candidates for the owner’s review, not fixes in this phase:

- `--help` can enqueue a forwarded task; there is no CLI-specific help command.
- `--version` runs yt-dlp; `:version` reports CLI metadata.
- Reserved flags after a colon command belong to the handler tail.
- Probe detection scans all retained tokens, including values and tokens after `--`.
- Timeout and list limit accept parseInt suffixes; maxAttempts requires canonical decimal text.
- `--vidbee-json` is already true; detach does not override wait; noRetry can remain true after a later nonzero maxAttempts.
- Explicit API URL validation happens before local/probe/local-command dispatch.
- Connected-command errors can be masked by connection failure because connection occurs first.
- `connect()` does not handshake; the first operation does.
- Supplied tokens skip handshake; after 401, clearing that token leads to `skipHandshake set but no token provided`.
- Concurrent handshakes can invalidate tokens; no single-flight renewal exists.
- HTTP exceptions usually become `UNKNOWN_ERROR`/2 rather than their apparent auth/reachability category.
- Add IDs and returned task IDs pass through HTTP without string validation or conversion.
- History list adds no terminal filter. Logs read `lastError.stderrTail`, not attempt logs.
- Probe stdout is not redacted; command arguments and stderr are.
- Probe overflow discards the entire crossing chunk and has TERM without escalation or timeout.
- Autostart catches synchronous spawn throws but has no asynchronous error listener.
- PID readiness ignores recorded start time and maps every thrown signal-zero probe to dead.
- Home defaults use `homedir()`, including its OS fallback when HOME is absent.
- No SIGINT/SIGTERM handler is installed; signal termination adds no queue or child cleanup.
- Local mode defaults to `~/Downloads/VidBeep`, despite a different comment.
- Local initialization imports dependencies even with injected executor/memory persistence.
- Local initialization failure lacks complete cleanup; normal SQLite shutdown can attempt a second close.
- Detached local admission is immediately followed by local teardown.
- Separate local invocations own separate queues.
- Paused/retry-scheduled waits stop immediately; queued polling uses the slow interval. Comments describe a different cadence.
- Upgrade accepts finite future cache timestamps, writes cache directly and silently ignores write failure.
- `:upgrade --no-cache` is not implemented despite a seam comment mentioning it.
- Registry fetch decoding strips a BOM; descriptor file decoding preserves it.
- Version extras are ignored; semver comparison remains approximate.
- `VIDBEE_API` and `VIDBEE_TOKEN` are not read by the implementation.
- The existing build shim’s caught-import-error bytes remain unchanged.

## 12. Decisions on the draft’s open questions

### 12.1 Host package and phase-10 closure

**Recorded decision:** keep one narrow unported `apps/cli-legacy` host for phase 8. It holds the bin entry, local compatibility-owner transport with borrowed better-sqlite3, and raw probe/launcher process adapters. The entry also supplies the exact `homedir()` value. Liveness follows section 12.8’s conditional qualification procedure.

The native process differences forcing the retained executable composition are listed in section 8. Native-kernel callback defects remain dependency obligations until phase 9.1; no CLI path reaching them is claimed. The strict CLI supplies and tests native local/process layers now.

Phase 9.1 resolves the native kernel and process obligations. Executable composition then moves to native layers. Phase 10 deletes the host after the strict entry meets the capability and signal obligations below. The byte oracle judges the transition; remaining differences must be declared at that time.

This decision does not authorize HTTP, synchronous-file, output or timing compatibility adapters.

### 12.2 Meaning of “argument parsing moves to effect/cli”

**Recorded decision:** preserve the command surface. Keep the scanner as a pure schema-backed calculation and dispatch the decoded invocation with Effect.

The global and per-subcommand probes in section 5 found no existing grammar that Effect CLI can own with identical acceptance, values and errors. The unit therefore imports no Effect CLI modules. A synthetic command tree or encoded payload is not used.

Changing the grammar to adopt Effect CLI remains an owner decision with the changes listed in section 9.

### 12.3 Unused library entries

**Recorded decision:** retain `.`, `./parser` and `./envelope` as strict API entries. Preserve pure helper signatures and expose schema-derived types, the Effect program and services. Do not maintain a Promise facade for unused exports.

Update publication/declaration metadata explicitly while preserving executable artifact paths, shebang and shim. Section 8 defines the built targets and requires source-unavailable resolution proof.

### 12.4 Non-finite external numbers

**Recorded decision:** adopt the descriptor, handshake and cache policies in section 9, each with independent old/new characterization cases.

No broader semantic validation is authorized. Loose automation IDs and task properties are not narrowed by these numeric-domain decisions.

### 12.5 Byte-oracle coverage and generated local admissions

**Recorded decision:** exact byte comparison covers deterministic executable vectors against the fake automation server, controlled yt-dlp and fixed descriptor/cache/package files.

Local admissions with generated IDs and timestamps receive packaged golden coverage with declared projections. They are not represented as exact byte coverage.

Both termination signals receive controlled differential vectors. The oracle compares exit code and termination signal separately and records child behavior.

### 12.6 SQLite route

**Recorded decision:** keep better-sqlite3 on the host side for the local SQLite route in this phase. Preserve lazy optional loading, borrowed-handle runtime ownership and the planned driver cutover. Continue both-client tests in separate processes.

### 12.7 Permanent reference and characterization

**Recorded decision:** retain the pre-port executable as a hashed permanent fixture at repository-root `fixtures/cli-pre-port`, outside every ported and unported unit. Run old and new against identical per-run paths. The reproduced bundle is 2,144,754 bytes, so the primary design commits it.

The checker derives roots from ported configurations under `apps` and `packages`; the fixture is outside them. Root Biome’s explicit includes omit it, and the CLI publication allowlist cannot include the repository-root directory. The fixture remains after host deletion. Do not edit the bundle or change the checker.

Record build provenance and hashes. Normal tests never rebuild from current source. The recorded-output fallback requires a fixed visible root and is used only if committing the bundle is rejected by repository policy.

Write pure characterization against the old source first, retain it, and add the per-field-substitution oracle. Exhaustive and process-spawning tests have the explicit limits in section 10.

### 12.8 Exact native descriptor liveness

**Recorded decision:** qualify the exact global `process.kill(pid, 0)` call in a strict `PidLiveness.driver.ts` before choosing its final placement.

The current CLI returns true when the call succeeds and false for every thrown value (`C/transport/descriptor.ts:163–175`). It performs no extra positive/integer/range validation and does not inspect `pidStartedAt`.

The proposed driver implements `CliPidLiveness.isAlive` as an Effect around exactly that call, mapping every thrown probe result to false. Run the actual driver under patched tsrs with `tsconfig.base.json` diagnostics, its test configuration and `scripts/port-check.mjs`. Record the source and complete diagnostic result.

If it passes, the strict descriptor service uses that driver. If it fails, record the exact forcing rule and put only signal-zero liveness in the host. Do not lower diagnostics, add a suppression, import a different process helper or substitute a process-list implementation.

The native task-queue `ProcessControl.isAlive` checks `/proc/<pid>` on Linux and runs `ps` or `tasklist` elsewhere (`packages/task-queue/src/ProcessControl.driver.ts:72–87`). That differs for permission-denied PIDs, zero/negative/fractional values and observable helper processes/file reads. It is rejected as a replacement. An acquired child handle’s `isRunning` likewise cannot probe an arbitrary descriptor PID.

Characterization covers successful probes and all thrown results, plus safe controlled cases for unusual accepted numeric values. Full diagnostic qualification remains implementation proof to obtain; it is not an unresolved policy choice.

### 12.9 Native JSON syntax diagnostics

**Recorded decision:** the replacement branch applies. Installed Schema JSON parsing discards the engine SyntaxError (`node_modules/effect/src/SchemaGetter.ts:1442–1453`), and pinned-Node probes confirm the schema issue text for malformed, BOM and multiline inputs.

Use `SchemaIssue.makeFormatterDefault()` with the returned `SchemaError.issue`, default parse options and no input reporting. Append its result to the existing descriptor prefix; use it directly as the registry syntax-failure message. Do not add `SchemaError(...)`, emulate engine text, retain an unported JSON parser or introduce a cause-preserving parser dependency.

Section 9 declares the exact bounded change and old/new messages. Registry BOM stripping, status-before-parse order, shape checks, null-root failure, automation null fallback and silent cache/package recovery stay as today.

This follows the task-queue design’s declared Schema syntax-diagnostic replacement and the port guide’s engine-error parity boundary.

### 12.10 Home-directory and signal obligations of the strict entry

**Recorded decision:** phase 8 obtains home with the same `node:os.homedir()` call as today, in the host entry, and injects it through `CliHost`. HOME-only lookup is insufficient. The strict phase-10 entry needs a native source with the same OS fallback before the host is deleted.

**Recorded decision:** both host and eventual strict entry install no SIGINT/SIGTERM handler. They do not use `NodeRuntime.runMain`. They run the fully provided terminal Effect with `Effect.runPromiseExit`, complete normal output and teardown, then set the exit code and explicitly exit. OS signal termination retains its identity, shell status and absence of new child cleanup. Section 6.5 and the permanent signal vectors are the acceptance contract.

### 12.11 Build and packaged capture

**Recorded decision:** clean distribution output once at the start, emit the library and declarations, then build the executable without cleaning again. Verify all three public entries and their declarations from the final distribution with source unavailable.

**Recorded decision:** packaged CLI cases use bounded capture through pipe closure and child `close`, recording both exit code and termination signal. The existing `exit`-based helper is repaired before the extended cases are accepted as proof.

### 12.12 Self-contained library distribution

**Recorded decision (orchestrator, after implementation evidence):** the source-unavailable proof of section 8 stands. The emitted library imports private workspace sources (`@vidbee/schema/LiteralKit` and any others the build finds), which no published layout can resolve. The private packages are therefore bundled into the library rather than referenced:

- One esbuild call bundles the three library entries into `dist/library` as ESM, with code splitting, so modules shared between entries keep one identity. Every `@vidbee/*` workspace import is inlined. The npm packages in the CLI's own `dependencies` stay external, as does `effect` if it is one of them. Nothing else is external.
- The declarations are emitted by the same `tsrs` step. Any declaration that refers to a private workspace module gets a copy of that module's emitted declarations under `dist/library/internal/<package>/`, and the build rewrites those specifiers to relative paths. No new dependency is added for declaration bundling.
- The distribution verifier is unchanged in intent. It copies only the publish layout and the external runtime dependencies, with the CLI source and workspace packages unavailable. It imports all three entries, checks them with the separate declaration consumer, and starts both executable paths.

The executable bundle `dist/index.mjs`, the shim and their bytes and paths stay as section 8 fixes them.

### 12.13 Fired deadline timer

**Recorded decision:** section 9, item 7. No custom clock that clears unconditionally, and no compatibility timer driver. The test reads the ported expectation from an `approved-changes.json` entry (kind `deadline-clear`, with the old and new `cleared` lists), in the same way the descriptor observations are read. The rest of the assertion stays as it is, under both switches: one scheduled delay of 123 ms, and rejection with `automation request failed: fixture body aborted`. A new case, recorded from the old code first, covers a body that finishes before the deadline and requires the timer to be cleared, for both the old code and the port.

### 12.14 Envelope encoding failures

**Recorded decision:** section 9, item 8. Pin both inputs (a BigInt and a cyclic value in `result`) in the pure oracle from the old source, as an old engine failure for which a new synchronous throw is required. Do not reproduce the engine message.

### Still open

The phase-10 native source for the home directory is not selected here. It must preserve `homedir()` behavior when HOME is absent and must satisfy the strict rules without retaining `apps/cli-legacy`.

Options are:

1. An installed public platform capability that exposes the OS home-directory lookup.
2. A reviewed platform dependency addition or extension exposing that capability to the strict entry.
3. An explicit owner decision changing the default-path behavior, with exact old/new cases declared at cutover.

Environment-only fallback and process-list probing do not satisfy the current contract. Keep the injected home input until a native source is selected and verified. Phase 8 makes no additional behavior decision.

## 13. Review

Reviewer: an independent session on the review-panel tier, read-only, on 2026-11-19. It read the plan, port guide, rule set, design, source and consumers, the phase 4 packages and downloader precedent, and installed Effect 4.1.4 sources, and ran in-memory and direct Node probes. One blocker, four major issues, two minor issues and two questions:

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | blocker | An unchanged pre-port bundle under the strict CLI unit is scanned and rejected for native Map/Set constructors. | Sections 10 and 12.7: permanent root `fixtures/cli-pre-port` belongs to no unit, lies outside checker roots and Biome includes, is absent from publication, and survives host deletion; bundle and checker stay unchanged. |
| 2 | major | String-only add/get contracts reject or alter successful automation wire IDs. | Sections 3, 5 and 10: unknown wire IDs remain unchanged through add, get and polling; local/domain IDs remain strings; numeric, false, null, empty and absent IDs receive request/output and failure characterization. |
| 3 | major | Home-directory behavior has no provider within the stated native boundary. | Sections 5, 8 and 12.10: host entry calls `node:os.homedir()` and supplies it through `CliHost`; HOME-absent fallback is pinned; a native source is an explicit phase-10 obligation with options under Still open. |
| 4 | major | `NodeRuntime.runMain` changes SIGTERM termination, loses signal identity and can add interruption cleanup. | Sections 6.5, 10 and 12.10: no signal handlers; handler-free `Effect.runPromiseExit` entry; normal sinks complete before explicit exit; both signals are compared during body consumption, probes, autostart and local work, including child observations. |
| 5 | major | The design retains a cause-preserving JSON-parser blocker after the architect selected bounded diagnostic replacement. | Sections 3, 4, 6.3, 9 and 12.9: public schema issue renderer selected; exact old/new messages declared; descriptor BOM rejection and registry BOM stripping remain distinct. |
| 6 | minor | Liveness options retain a rejected process-list replacement instead of the required strict-driver qualification. | Sections 5, 10 and 12.8: qualify exact global signal-zero driver under patched tsrs and checker; use it strictly if accepted, otherwise move only that capability to the host and name the forcing rule. |
| 7 | minor | Packaged capture resolves on `exit` before stdout/stderr closure. | Section 10: require a bounded helper recording status/signal and collecting through pipe closure and child `close`, with large-output and held-pipe cases. |
| 8 | question | The current executable build cleans away declarations if run after declaration emission. | Section 8: current clean at `scripts/build.mjs:25` is replaced by one initial clean, library/declaration build, executable build and source-unavailable distribution resolution; section 10 pins the sequence. |
| 9 | question | Native-kernel callback defects are presented as executable paths without a sequence reaching them. | Sections 1, 8 and 12.1: label row 49 as a dependency obligation until phase 9.1; `factory({})` and per-invocation memory queues explain current reachability; native process differences remain the host justification. |

The reviewer found sound: retaining the scanner, the final Stdio sink’s pipe-completion mechanism, the scoped fetch-backed HTTP capabilities, the bounded finite-number exceptions, the raw probe/launcher distinction and the deterministic isolation strategy, with generated local admissions and other nondeterministic results kept outside exact-byte claims.