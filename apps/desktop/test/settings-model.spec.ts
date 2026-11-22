import { strict as assert } from "node:assert";
import { it } from "@effect/vitest";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as Order from "effect/Order";
import * as R from "effect/Record";
import * as Result from "effect/Result";
import * as S from "effect/Schema";
import {
  projectSettings,
  SettingKey,
  SettingsPatch,
  SettingUpdate,
  settingsPatchFromEntries,
} from "../src/shared/Settings.model.js";
import { AppSettings } from "../src/shared/types/Desktop.model.js";
import { defaultSettings } from "../src/shared/types/index.js";

it.effect("every known field has exactly its correlated update branch", () =>
  Effect.gen(function* () {
    assert.equal(SettingKey.literals.length, 41);
    for (const key of SettingKey.literals) {
      const update = yield* S.decodeUnknownEffect(S.toType(SettingUpdate))({ key, value: defaultSettings[key] });
      assert.equal(update.key, key);
      assert.deepEqual(update.value, defaultSettings[key]);
    }
    assert.equal(
      Result.isFailure(S.decodeUnknownResult(S.toType(SettingUpdate))({ key: "closeToTray", value: "false" })),
      true
    );
    assert.equal(
      Result.isFailure(S.decodeUnknownResult(S.toType(SettingUpdate))({ key: "theme", value: false })),
      true
    );
    assert.equal(
      Result.isFailure(S.decodeUnknownResult(S.toType(SettingUpdate))({ key: "future", value: false })),
      true
    );
    assert.deepEqual(A.sort(SettingKey.literals, Order.String), A.sort(R.keys(AppSettings.fields), Order.String));
  })
);

it.effect("typed fallback is independent for every field and leaves raw documents unchanged", () =>
  Effect.gen(function* () {
    const defaults = { ...defaultSettings, downloadPath: "/portable/Downloads", launchAtLogin: false };
    for (const key of SettingKey.literals) {
      const malformed = { ...defaults, [key]: null, future: { deep: ["retained"] } };
      const original = { ...malformed };
      const result = projectSettings({ document: malformed, defaults });
      assert.equal(Result.isSuccess(result), true);
      if (Result.isSuccess(result)) {
        assert.deepEqual(result.success.invalidKeys, [key]);
        assert.deepEqual(result.success.settings[key], defaults[key]);
        assert.deepEqual(result.success.settings.future, malformed.future);
      }
      assert.deepEqual(malformed, original);
    }
    yield* Effect.void;
  })
);

it.effect("typed view preserves permissive valid values and nested unknown preferences", () =>
  Effect.gen(function* () {
    const document = {
      ...defaultSettings,
      theme: "future-theme",
      maxConcurrentDownloads: -0.5,
      extensionCookieSources: [{ id: "a", browser: "b", future: { own: undefined, n: -0 } }],
      future: { own: undefined, n: -0 },
    };
    const result = projectSettings({ document, defaults: defaultSettings });
    assert.equal(Result.isSuccess(result), true);
    if (Result.isSuccess(result)) {
      assert.deepEqual(result.success.invalidKeys, []);
      assert.deepEqual(result.success.settings, document);
    }
    yield* Effect.void;
  })
);

it.effect("ordered batch survives codec and duplicate keys fail before execution", () =>
  Effect.gen(function* () {
    const entries: ReadonlyArray<readonly [string, unknown]> = [
      ["launchAtLogin", false],
      ["hideDockIcon", true],
      ["language", "en"],
    ];
    const patch = settingsPatchFromEntries(entries);
    assert.equal(Result.isSuccess(patch), true);
    if (Result.isSuccess(patch)) {
      const encoded = yield* S.encodeEffect(SettingsPatch)(patch.success);
      const decoded = yield* S.decodeEffect(SettingsPatch)(encoded);
      assert.deepEqual(
        A.map(decoded, (update) => update.key),
        ["launchAtLogin", "hideDockIcon", "language"]
      );
      assert.equal(Result.isFailure(S.decodeUnknownResult(S.toType(SettingsPatch))([...decoded, decoded[0]])), true);
    }
    const empty = yield* S.decodeEffect(SettingsPatch)([]);
    assert.deepEqual(empty, []);
  })
);

it.effect("every typed write rejects sparse and decorated batches", () =>
  Effect.gen(function* () {
    const sparse = Array<unknown>(1);
    const decorated = [{ key: "theme", value: "dark" }];
    Reflect.defineProperty(decorated, "extra", { value: true, enumerable: true });
    assert.equal(Result.isFailure(S.decodeUnknownResult(S.toType(SettingsPatch))(sparse)), true);
    assert.equal(Result.isFailure(S.decodeUnknownResult(S.toType(SettingsPatch))(decorated)), true);
    assert.equal(
      Result.isFailure(S.decodeResult(S.toType(SettingsPatch))([{ key: "maxConcurrentDownloads", value: Number.NaN }])),
      true
    );
    yield* Effect.void;
  })
);
