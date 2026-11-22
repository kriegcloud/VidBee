> VidBee edition. Authority: repository instructions, PLAN A1/A2, and the approved
> [standards tooling design](../../../docs/effect-port/design/standards-tooling.md) precede this edition. D1 deletes existing
> facades in phase 10; D2 uses deterministic scoped ownership; D3 preserves emitted
> error bytes with tagged failures and boundary formatting; D4 adjudicates encoded
> causes per field; D5 requires an exact independently approved parity contract.
> No classification changes a compiler diagnostic, port check, or empty allowlist.
> Adaptations: VidBee branding, package aliases, runtime owners, commands and graph.
> Local enforcement: R01–R22, T01–T08 and RV obligations in the approved design.
> Attribution: adapted from beep-effect `.claude/skills/schema-first-development/references/local-primitives.md` at `71d246dc5a49d3f41222308b866d42c220cf1ee4`.

# Available VidBee primitives

Use upstream Effect 4.1.4 first. Verify exports and declarations before choosing an API.
VidBee has no private beep-effect dependency and no foundation/slice topology.

- `@vidbee/schema/LiteralKit`: named literal domains and tagged-union assembly.
- `@vidbee/identity/packages`: generated workspace roots; bind actual extensionless file children.
- `@vidbee/schema/Option`: `getSomesStruct`, heterogeneous fixed-key Option compaction.
- `@vidbee/schema/SchemaUtils/withStatics`: non-codec domain statics with descriptor checks.

MappedLiteralKit is unavailable. The OptionFrom family is shorthand, not a callable API.
Use exact optional-key codecs verified in the design. Classes retain in-body guards;
universal attached codec facades are prohibited. Keep necessary literal/tuple const
assertions, but do not assert an inline tuple passed to LiteralKit.

Retire a local helper's covered facets when upstream covers its intent. Record a facet
census for any retained uncovered semantics, with actual call sites and review evidence.
Persisted SQL rows belong to their actual VidBee package; do not import a private SQL
integration or reorganize packages into the reference repository's topology.
