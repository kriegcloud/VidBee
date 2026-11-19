# Pre-port pure and schema oracles

`pure-oracle.json` and `schema-oracle.json` were recorded against unchanged
subscriptions-core public exports under the repository-pinned Node 22.23.4.
The inputs and observations live in the adjacent TypeScript modules. Ordinary
Vitest runs only read the JSON files; they never update them. The pure oracle
contains 1,605 finite generated cases; the schema oracle contains 4,954 cases
covering all 20 schema exports, complete decoded values and complete zod issue
arrays. The suites additionally assert public/root export identity, synchronous
callback-error identity, default clock/entropy sampling, and three pinned-Node date-runtime observations.

The schema matrix substitutes each populated field with undefined, null, JSON
scalars, nonfinite/unsafe numbers, arrays and objects, and removes it entirely.
It pins all literal members and neighboring literals, download preferences,
category syntax and limits, pagination bounds, nested unknown-key stripping and
optional/null behavior. Schema issue messages describe zod's current schemas;
the strict Effect schema oracle can compare acceptance and decoded values while
compatibility's retained zod API keeps its complete zod observations.

The pure matrix covers forms, resolver URLs and profile aliases, duplicate keys,
constants/catalog/category helpers, inherited status names, live task precedence,
download option combinations, artwork/HTML/cover precedence, normalization,
identity/stable ordering, RSS and profile policies, history-call traces, cutoff,
keyword and category/version rules, interval/due checks, and retry/jitter calls.
Objects retain explicit undefined values through an encoded marker; nonfinite
numbers likewise retain their identity instead of becoming JSON null. Every
engine failure outside declared input types is marked `engine: true`; tests
assert failure only. Successful scalar/null/NaN results compare completely.

`date-oracle.json` records UTC, Asia/Tokyo and America/New_York separately.
The test launches the explicitly selected pinned Node with each timezone;
results never depend on the test runner's ambient timezone. It covers zoneless
ISO, date-only ISO, RFC/named zones, DST transitions, numeric/nonstring coercion,
fallback clock counts, coercion failure, and the reviewed external-data nested
XML identity TypeError with its exact Node class and message. A numeric `7`
parsed as a date is timezone-sensitive, so those substitutions are deliberately
kept in this explicit-runtime oracle rather than the ambient-runtime matrix.

To deliberately regenerate pure/schema snapshots before a rewrite, explicitly
select the pinned Node installation and run:

```sh
node --import tsx packages/subscriptions-core/test/fixtures/record-pure-schema.ts
```

The recorder verifies Node's version and rejects Bun. Date snapshots are recorded
by launching `date-oracle.ts` with each of the three explicit `TZ` values and
storing each complete JSON result under that timezone key. Regeneration after
rewriting the implementation would replace the evidence and must not be used to
make parity failures pass.

`legacy-types.ts` is the unchanged source declaration module, preceded only by a
pre-port header. `legacy-declarations/` contains the compiler-emitted closure of
all fifteen public source modules. External package imports retain their public
specifiers. No tests explicitly import these declarations: the scoped
characterization tsconfig maps public subscription imports to them only while
typechecking, avoiding accidental inclusion of unrelated source diagnostics.
`declaration-contract.ts` adds positive compile-time uses for explicit undefined,
nullable interval updates, nested mutations, mutable elements in readonly
selector arrays, timeline/dedupe inference, and callback/Promise signatures.
