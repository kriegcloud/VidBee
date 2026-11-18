# @vidbee/schema

LiteralKit copied from beep-effect commit `65bdb9c94825d9722c73599e24024b3b8c5cdb2c`.

Copied files: `src/LiteralKit/index.ts`, `src/LiteralKit/LiteralKit.schema.ts`,
`src/LiteralKit/LiteralKit.errors.ts`, `src/LiteralKit/internal/builders.ts`,
`test/LiteralKit.test.ts`. Utils imports resolve directly to their public Effect
Array/Record counterparts. Private identity helper usage becomes explicit public
schema identifiers and annotations. No private packages are dependencies.
Tests use public @effect/vitest; private test-runner/fc-runs helpers are replaced
with public equivalents. Suppressed negative type examples are removed from the
runtime suite; rejected calls are verified by an external compiler fixture.
