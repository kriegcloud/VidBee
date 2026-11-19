import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MutableHashMap from "effect/MutableHashMap";
import * as Str from "effect/String";
import { CliDescriptorLive } from "../../src/CliDescriptor.layer.js";
import { CliDescriptor } from "../../src/CliDescriptor.service.js";
import { CliUpgradeLive, CliVersionLive } from "../../src/CliInfo.layer.js";
import { CliRegistry } from "../../src/CliRegistry.service.js";
import { CliUpgrade } from "../../src/CliUpgrade.service.js";
import { CliVersion } from "../../src/CliVersion.service.js";
import { originalMessage } from "../../src/transport/descriptor.js";
import { base, descriptor, environment, files, reads } from "./fixtures.js";

const registry = Layer.succeed(CliRegistry, { latest: Effect.succeed({ version: "2.0", fetchedAt: 1000 }) });
const dependencies = Layer.mergeAll(base, registry);
layer(Layer.mergeAll(CliDescriptorLive, CliVersionLive, CliUpgradeLive).pipe(Layer.provide(dependencies)))((it) => {
  it.effect("foreign errors with similarly named metadata keep their own message", () =>
    Effect.sync(() => {
      const error = Object.assign(new Error("outer"), { reason: { cause: new Error("inner") } });
      expect(originalMessage(error)).toBe("outer");
    })
  );
  it.effect("descriptor absence, syntax, read failure and success retain distinct branches", () =>
    Effect.gen(function* () {
      const service = yield* CliDescriptor;
      const missing = yield* service.read({ pathOverride: "/missing" });
      expect(missing.ok).toBe(false);
      MutableHashMap.set(files, "/invalid", "{");
      const invalid = yield* service.read({ pathOverride: "/invalid" });
      expect(invalid.ok ? "" : invalid.envelope.message).toBe(
        "automation descriptor is malformed: Expected a valid JSON string"
      );
      const readFailure = yield* service.read({ pathOverride: "/read-failure" });
      expect(readFailure.ok ? "" : readFailure.envelope.message).toBe(
        "automation descriptor is malformed: fixture read failure"
      );
      MutableHashMap.set(files, "/descriptor", descriptor);
      const valid = yield* service.read({ pathOverride: "/descriptor" });
      expect(valid.ok && valid.descriptor.schemaVersion).toBe("1.0.0");
    })
  );
  it.effect("normalizes each non-finite descriptor field independently", () =>
    Effect.gen(function* () {
      const service = yield* CliDescriptor;
      for (const field of ["port", "pid", "pidStartedAt", "tokenIssuedAt", "tokenExpiresAt", "updatedAt"]) {
        const raw =
          field === "port"
            ? '{"version":1,"host":"localhost","port":1e999,"pid":123,"pidStartedAt":1}'
            : field === "pid"
              ? '{"version":1,"host":"localhost","port":1,"pid":1e999,"pidStartedAt":1}'
              : field === "pidStartedAt"
                ? '{"version":1,"host":"localhost","port":1,"pid":123,"pidStartedAt":1e999}'
                : `${Str.slice(0, -1)(descriptor)},"${field}":1e999}`;
        MutableHashMap.set(files, "/finite", raw);
        const result = yield* service.read({ pathOverride: "/finite" });
        expect(result.ok).toBe(field !== "port" && field !== "pid" && field !== "pidStartedAt");
        if (result.ok)
          expect(
            result.descriptor[
              field === "updatedAt" ? "updatedAt" : field === "tokenIssuedAt" ? "tokenIssuedAt" : "tokenExpiresAt"
            ]
          ).toBe(field === "updatedAt" ? 0 : null);
      }
    })
  );
  it.effect("descriptor overrides preserve literal whitespace and call-time environment", () =>
    Effect.gen(function* () {
      const service = yield* CliDescriptor;
      MutableHashMap.set(environment, "VIDBEE_AUTOMATION_DESCRIPTOR", " /fixture/environment ");
      const first = yield* service.path();
      expect(first).toBe("/fixture/environment");
      const literal = yield* service.path({ envOverride: " /literal " });
      expect(literal).toBe(" /literal ");
      MutableHashMap.remove(environment, "VIDBEE_AUTOMATION_DESCRIPTOR");
      const fallback = yield* service.path();
      expect(fallback).toBe("/fixture/home/.config/VidBee/automation.json");
    })
  );
  it.effect("version candidates fall through syntax/name failures in order", () =>
    Effect.gen(function* () {
      const service = yield* CliVersion;
      MutableHashMap.set(files, "/bad-package", "{");
      MutableHashMap.set(files, "/wrong-package", '{"name":"other","version":"9"}');
      MutableHashMap.set(files, "/package", '{"name":"@vidbee/cli","version":"1.2"}');
      const before = reads.length;
      const result = yield* service.read(["/bad-package", "/wrong-package", "/package", "/unused"]);
      expect(result.cli).toBe("1.2");
      expect(reads.slice(before)).toEqual(["/bad-package", "/wrong-package", "/package"]);
      const fallback = yield* service.read([]);
      expect(fallback.cli).toBe("0.0.0-dev");
    })
  );
  it.effect("upgrade rejects non-finite cache timestamps but preserves finite future values", () =>
    Effect.gen(function* () {
      const service = yield* CliUpgrade;
      MutableHashMap.set(files, "/cache", '{"version":"3.0","fetchedAt":1e999}');
      const fetched = yield* service.check({ current: "1.0", cachePath: "/cache" });
      expect(fetched.cached).toBe(false);
      expect(fetched.latest).toBe("2.0");
      MutableHashMap.set(files, "/cache", '{"version":"3.0","fetchedAt":4102444800000}');
      const cached = yield* service.check({ current: "1.0", cachePath: "/cache" });
      expect(cached.cached).toBe(true);
      expect(cached.cachedAt).toBe("2100-01-01T00:00:00.000Z");
    })
  );
});
