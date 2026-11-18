import { fileURLToPath } from "node:url";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Digest from "effect/crypto/Digest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as MutableHashMap from "effect/MutableHashMap";
import * as O from "effect/Option";
import * as Path from "effect/Path";
import * as S from "effect/Schema";

const runtime = ManagedRuntime.make(Layer.merge(NodeServices.layer, NodeCrypto.layer));
export const path = runtime.runSync(Path.Path);
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const files = MutableHashMap.empty<string, string>();
const hashes = MutableHashMap.empty<string, string>();
await runtime.runPromise(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const digest = yield* Digest.Digest;
    const roots = [
      "packages/db/test/snapshots",
      "packages/db/test/fixtures/drizzle-0.45",
      "apps/desktop/resources/drizzle",
    ];
    const names = ["apps/desktop/src/main/lib/database/migrate.ts", "apps/desktop/src/main/lib/subscriptions-host.ts"];
    for (const directory of roots) {
      const entries = yield* fs.readDirectory(path.join(root, directory), { recursive: true });
      for (const entry of entries) {
        const filename = path.join(directory, entry);
        const info = yield* fs.stat(path.join(root, filename));
        if (info.type === "File") names.push(filename);
      }
    }
    for (const name of names) {
      const filename = path.join(root, name);
      const text = yield* fs.readFileString(filename);
      const hash = yield* digest.digestHex(Digest.sha256, new TextEncoder().encode(text));
      MutableHashMap.set(files, filename, text);
      MutableHashMap.set(hashes, filename, hash);
    }
  })
);
export const readText = (filename: string | URL) =>
  O.getOrThrow(MutableHashMap.get(files, typeof filename === "string" ? filename : fileURLToPath(filename)));
export const fileHash = (filename: string) => O.getOrThrow(MutableHashMap.get(hashes, filename));
const JsonRows = S.Record(S.String, S.Unknown).pipe(S.Array, S.fromJsonString);
export const parseRows = (text: string) => runtime.runSync(S.decodeEffect(JsonRows)(text));
const Journal = S.fromJsonString(S.Struct({ entries: S.Array(S.Struct({ tag: S.String, when: S.Finite })) }));
export const readJournal = () =>
  runtime.runSync(
    S.decodeEffect(Journal)(readText(path.join(root, "packages/db/test/fixtures/drizzle-0.45/meta/_journal.json")))
  );
export const quoteString = (text: string) => runtime.runSync(S.encodeEffect(S.fromJsonString(S.String))(text));
export const record = (value: unknown) => runtime.runSync(S.decodeUnknownEffect(S.Record(S.String, S.Unknown))(value));
export const testDriver = runtime.runSync(Config.String("DB_TEST_CLIENT").pipe(Config.withDefault("direct")));
