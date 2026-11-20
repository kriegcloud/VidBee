import { describe, expect, it } from "@effect/vitest";
import * as A from "effect/Array";
import * as Result from "effect/Result";
import { classify, parseRetryAfter, sanitizeOutput } from "../src/classifier/index.js";
import { downloadIdentity } from "../src/download-identity.js";
import { transition } from "../src/fsm/index.js";
import { EMPTY_PROGRESS } from "../src/types.js";
import { hashRawArgs, sha256 } from "../src/util/sha256.js";
import type { Task } from "../src/types.js";

function task(): Task {
  return {
    id: "pure",
    kind: "video",
    parentId: null,
    input: { url: "https://example.com/video", kind: "video" },
    status: "queued",
    prevStatus: null,
    statusReason: null,
    attempt: 0,
    maxAttempts: 3,
    nextRetryAt: null,
    priority: 10,
    groupKey: "default",
    progress: { ...EMPTY_PROGRESS },
    output: null,
    lastError: null,
    pid: null,
    pidStartedAt: null,
    createdAt: 1,
    updatedAt: 1,
    enteredStatusAt: 1,
  };
}

describe("pure kernel", () => {
  it("matches SHA-256 vectors, multi-block UTF-8 and the historical argument format", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
    expect(hashRawArgs(undefined)).toBe("sha256:none");
    expect(hashRawArgs([])).toBe("sha256:none");
    expect(hashRawArgs(["a", "b"])).toBe(`sha256:${sha256("a b")}`);
    expect(
      sha256(
        A.join(
          A.makeBy(1000, () => "é"),
          ""
        )
      )
    ).toBe("75628d88c411e2c7a3e1cbb3f0eb5498e51455875142fedd62677987cdecf107");
  });
  it("returns illegal transitions as data and stamps only the supplied time", () => {
    const original = task();
    const illegal = transition(original, "completed", { trigger: "finalize-success", now: 42 });
    expect(Result.isFailure(illegal)).toBe(true);
    if (Result.isFailure(illegal))
      expect(illegal.failure.legacyMessage).toBe("IllegalTransition: queued -> completed (finalize-success)");
    const dispatched = transition(original, "running", { trigger: "dispatch", now: 42 });
    expect(Result.isSuccess(dispatched)).toBe(true);
    if (Result.isSuccess(dispatched)) {
      expect(dispatched.success.updatedAt).toBe(42);
      expect(dispatched.success.input.options?.startedAt).toBe(42);
      expect(dispatched.success.attempt).toBe(1);
    }
    expect(original.status).toBe("queued");
  });
  it("computes header deadlines against explicit time and preserves redaction", () => {
    expect(parseRetryAfter("Tue, 14 Nov 2023 22:14:05 GMT", 1700000000000)).toBe(45000);
    expect(classify({ stderr: "HTTP Error 429\nRetry-After: 9", retryAfterHeader: "0" }, 0).suggestedRetryAfterMs).toBe(
      0
    );
    expect(sanitizeOutput("Cookie: secret\ntoken=hidden")).toBe("Cookie: <redacted>\ntoken: <redacted>");
  });
  it("classifies a hidden private Instagram story as a sign-in problem", () => {
    const stderr =
      "[instagram][error] Private profile: the Instagram account in your cookies does not follow fixture, " +
      "so Instagram hides its stories.";
    expect(classify({ stderr, exitCode: 4 }, 0).category).toBe("auth-required");
  });
  it("keeps normalized media identity and option distinctions", () => {
    const base = { kind: "video" as const, url: "https://youtu.be/example?utm_source=share" };
    expect(downloadIdentity(base)).toBe(downloadIdentity({ ...base, url: "https://www.youtube.com/watch?v=example" }));
    expect(downloadIdentity({ ...base, options: { format: "22" } })).not.toBe(downloadIdentity(base));
    expect(downloadIdentity({ ...base, url: "file:///video" })).toBeNull();
  });
});
