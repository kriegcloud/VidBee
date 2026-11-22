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


## Services review calibration (FIX1)

The 459-KiB real settings aggregate requires structure-aware admission, including
retained unknown fields and tagged wire expansion. The production RPC regressions
exercise 2,650 records (below that size), 2,850 (above it), and 5,700 (over twice
it), with an eight-level retained subtree and the complete Settings.GetAll
Completion. Calibration measures the installed Conf tab-indented representation,
encoded wire value, frame and retained decoded value separately.

The frame ceiling stays 64 MiB and application retention stays 2 GiB. Codec
transformation ownership is now 128 MiB and persistent document/window retention
is 256 MiB. For the roughly 946-KiB structured fixture the conservative encoded
value charge is about 117 MB (112 MiB); a 64-MiB codec ceiling could not admit it.
The doubled window bound covers the independently charged encoded copies. These
are finite measured admission ceilings, not preallocated buffers or RSS bounds.
Observation traversal retains its 64-MiB budget and depth 64 guard; charging at
least 32 bytes per counted node bounds it to 2,097,152 counted nodes. The decoded
value estimator retains 128 MiB and depth 256, with at most 1,048,576 traversed nodes
(each charged at least 128 bytes). Byte/depth exhaustion still fails visibly.

Retained old-invoke asynchronous calls do not use these RPC quotas. Their native
completion/drain supervisor remains, without a synthetic shared window account.
Settings writes capture the invoking client's optional live settings registration
at admission and carry its cuts on successful and failed application exits.

The observation codec keeps64 native levels. Tagged object edges expand into
three wire edges, with additional RPC envelopes; retention measurement therefore
allows4 *64 levels (256), still finite. A full production GetAll regression pins
maximum native-depth64 admission and another test rejects measurement depth257.
