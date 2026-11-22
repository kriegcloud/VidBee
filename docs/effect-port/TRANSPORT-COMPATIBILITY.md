# Native JSON syntax compatibility disposition

`apps/desktop/src/main/lib/legacy/JsonSyntax.compat.ts` is the named native JSON
syntax compatibility unit required by desktop-foundation-amendment section 13.
Its ownership partition is **legacy**, capability `9.0-foundation-compatibility`,
in the node and test environments. It is not a strict/ported parser, a diagnostic
suppression, or a driver-name exemption. The strict `JsonSyntax` service describes
only the injected capability. Strict consumers cannot import this compatibility
implementation; legacy bootstrap composition supplies its Layer.

The implementation calls the native `JSON.parse` once inside `Effect.try` and
keeps the actual thrown value in the main-only `OriginalFailure` carrier. It
copies the native message into the carrier's populated legacy message field.
It neither reconstructs parser diagnostics nor replaces the parser with Schema's
JSON issue formatter. Semantic validation remains at each consumer's existing
interpretation point. No Promise or runtime is created here.

This disposition implements the frozen design and the architect's continuation
instruction to provide a named, standards-classified compatibility unit. No
standards allowlist, diagnostic severity, or historical strict membership changes.
The independent native syntax regression compares actual native exception classes
and messages and verifies recognized-carrier unwrapping. No existing metadata
consumer or legacy invoke behavior changes in this transport lane.
