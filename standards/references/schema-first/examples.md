> VidBee edition. Authority: repository instructions, PLAN A1/A2, and the approved
> [standards tooling design](../../../docs/effect-port/design/standards-tooling.md) precede this edition. D1 deletes existing
> facades in phase 10; D2 uses deterministic scoped ownership; D3 preserves emitted
> error bytes with tagged failures and boundary formatting; D4 adjudicates encoded
> causes per field; D5 requires an exact independently approved parity contract.
> No classification changes a compiler diagnostic, port check, or empty allowlist.
> Adaptations: VidBee branding, package aliases, runtime owners, commands and graph.
> Local enforcement: R01–R22, T01–T08 and RV obligations in the approved design.
> Attribution: adapted from beep-effect `.claude/skills/schema-first-development/references/examples.md` at `71d246dc5a49d3f41222308b866d42c220cf1ee4`.

# Local examples and proof ownership

Use actual public exports and package source. The reference repository is not a
runtime or documentation dependency.

1. Branded Opaque plain records: `tooling/standards/src/Standards.model.ts`.
   `SourceRange` owns ordered UTF-16 offsets. Persisted classes with observed
   behavior remain classes, as in `packages/db/src/Transcripts.model.ts`.
2. Constructor and decode defaults: use upstream `S.withConstructorDefault`,
   `S.withDecodingDefaultKey` and `S.withDecodingDefaultTypeKey`. Keep construction,
   missing-key decoding, present undefined and encoding distinct; use the exact
   tested forms in the design. A shorter default cannot change historical acceptance.
3. Optional boundary data and tagged failures: `Workspace.layer.ts` consumes
   manifest fields with exact keys and maps decoding failures to `InvalidInput`.
   Domain absence uses Option. No private SQL integration is assumed.
4. Literal domains and tagged unions: `@vidbee/schema/LiteralKit` owns Enum,
   predicates, matching and tagged-union construction. Use its public export and
   the production-derived property tests in `packages/schema/test/LiteralKit.test.ts`.
5. Foreign inputs and normalization: decode the selected external payload, preserve
   required transport keys and raw cause/host identity, then perform domain work.
   `docs/effect-port/PORT-GUIDE.md` records package-specific boundary contracts.
6. Property laws: derive `Arbitrary.schema` from the production schema and assert
   construction/codec/normalization properties. Fixed oracle counterexamples remain
   alongside generated tests. No helper is advertised merely because B has one.

For a new service, read `CompilerHost.service.ts` and `CompilerHost.layer.ts`:
contracts use Context.Service; Layers own resource acquisition and finalization.
For statics, read `@vidbee/schema/SchemaUtils/withStatics` and the identity integration
test. Guards remain in-body where appropriate; universal attached codec facades retire.
