import { expect, it } from "@effect/vitest";
import * as Str from "effect/String";
import { makeModelHash } from "../../src/ModelHash.js";

it("incremental binary SHA-256 agrees with independent fixed vectors across chunk boundaries", {
  timeout: 30000,
}, () => {
  const vectors = [
    { bytes: new Uint8Array(), expected: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    {
      bytes: new TextEncoder().encode("abc"),
      expected: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
    {
      bytes: new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
      expected: "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    },
    {
      bytes: new Uint8Array([0, 255, 128]),
      expected: "f742b965f156c10374bc23aea96e3a8aff8facd6fc079defeaa30219ad86f211",
    },
  ];
  for (const vector of vectors)
    for (const size of [1, 3, 7, 63, 64, 65, 4096]) {
      const hash = makeModelHash();
      for (let offset = 0; offset < vector.bytes.length; offset += size)
        hash.update(vector.bytes.subarray(offset, offset + size));
      expect(hash.digest()).toBe(vector.expected);
    }
  const million = new TextEncoder().encode(Str.repeat(1_000_000)("a"));
  const hash = makeModelHash();
  for (let offset = 0; offset < million.length; offset += 8191) hash.update(million.subarray(offset, offset + 8191));
  expect(hash.digest()).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
});
