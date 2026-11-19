import { expect, it } from "@effect/vitest";
import * as A from "effect/Array";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import { getBrowserProfileBaseDirs, getBrowserProfileCandidates } from "../src/cookie-browser-paths.js";
import { inspectNetscapeCookies, matchCookieSites, serializeNetscapeCookies } from "../src/cookie-setup.js";
import { DownloadTask } from "../src/Download.model.js";
import { buildFilePathCandidates } from "../src/download-file.js";
import { getDisplayFormats } from "../src/format-presentation.js";
import { resolveMappedProfileSource } from "../src/mapped-profile-source.js";
import { InstagramInventory, SocialMappedProfile } from "../src/ProfilePersistence.model.js";
import { SocialMediaOptionsSchema } from "../src/social-media.js";
import { expandSubtitleLanguageAliases } from "../src/subtitle-languages.js";

it.effect("retains mutable legacy fields, arrays and explicit undefined", () =>
  Effect.gen(function* () {
    const task = yield* S.decodeEffect(DownloadTask)({
      id: "task",
      url: "url",
      type: "video",
      status: "pending",
      createdAt: 1,
      tags: ["first"],
      selectedFormat: { formatId: "a", ext: "mp4" },
      title: undefined,
    });
    task.title = undefined;
    task.tags?.push("second");
    if (task.selectedFormat !== undefined) task.selectedFormat.height = 720;
    expect(task.tags).toEqual(["first", "second"]);
    expect(task.selectedFormat?.height).toBe(720);
  })
);

it.effect("strips unknown inventory keys at every rewritten object level", () =>
  Effect.gen(function* () {
    const saved = yield* S.decodeUnknownEffect(SocialMappedProfile)({
      profileUrl: "https://x.com/example",
      platform: "x",
      owner: "example",
      updatedAt: 1,
      extra: true,
      categories: {
        tweets: {
          state: "complete",
          extra: true,
          items: [
            { id: "1", url: "https://x.com/i/web/status/1", author: "example", images: 1, videos: 0, extra: true },
          ],
        },
      },
    });
    expect(saved).toEqual({
      profileUrl: "https://x.com/example",
      platform: "x",
      owner: "example",
      updatedAt: 1,
      categories: {
        tweets: {
          state: "complete",
          items: [{ id: "1", url: "https://x.com/i/web/status/1", author: "example", images: 1, videos: 0 }],
        },
      },
    });
    saved.categories.tweets?.items.push({
      id: "2",
      url: "https://x.com/i/web/status/2",
      author: "example",
      images: 0,
      videos: 1,
    });
    expect(saved.categories.tweets?.items.length).toBe(2);
    const inspection = yield* S.decodeUnknownEffect(InstagramInventory)({
      inspectionId: "instagram_example",
      expiresAt: 2,
      complete: true,
      profile: { username: "example", profileUrl: "https://instagram.com/example/", extra: true },
      categories: [
        {
          category: "posts",
          state: "ready",
          sourceCount: 1,
          assetCount: 1,
          extra: true,
          items: [{ id: "1", url: "https://instagram.com/p/abc/", assetCount: 1, extra: true }],
        },
      ],
      totalSourceCount: 1,
      totalAssetCount: 1,
      extra: true,
    });
    expect(inspection.profile).toEqual({ username: "example", profileUrl: "https://instagram.com/example/" });
    expect(inspection.categories[0]).toEqual({
      category: "posts",
      state: "ready",
      sourceCount: 1,
      assetCount: 1,
      items: [{ id: "1", url: "https://instagram.com/p/abc/", assetCount: 1 }],
    });
  })
);

it.effect("preserves social defaults and live date and counter checks", () =>
  Effect.gen(function* () {
    const options = yield* S.decodeEffect(SocialMediaOptionsSchema)({});
    expect(options).toEqual({
      media: "all",
      scope: "post",
      authorOnly: false,
      expandThreads: false,
      linkedMedia: true,
      slideshowAudio: false,
    });
    expect(S.is(SocialMediaOptionsSchema)({ ...options, since: "2025-02-29" })).toBe(false);
    expect(S.is(SocialMediaOptionsSchema)({ ...options, since: "2024-02-29" })).toBe(true);
    expect(S.is(SocialMediaOptionsSchema)({ ...options, since: "2024-03-01", until: "2024-02-29" })).toBe(false);
    expect(S.is(SocialMediaOptionsSchema)({ ...options, maxPosts: 1_000_001 })).toBe(false);
  })
);

it("builds target-platform browser paths including roots and dot segments", () => {
  expect(getBrowserProfileBaseDirs("win32", "\\\\server\\share\\a\\..", "firefox")).toEqual([
    "\\\\server\\share\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles",
  ]);
  expect(getBrowserProfileCandidates("linux", "/a/../owner", "chrome")).toEqual([
    "/owner/.config/google-chrome/Default",
    "/owner/.config/google-chrome/Profile 1",
  ]);
});

it("preserves group insertion order while replacing an HLS rendition", () => {
  const first = { formatId: "first", ext: "mp4", vcodec: "avc1", height: 1080, protocol: "m3u8" };
  const second = { formatId: "second", ext: "mp4", vcodec: "avc1", height: 720 };
  const replacement = { ...first, formatId: "replacement", protocol: "https" };
  expect(getDisplayFormats({ formats: [first, second, replacement], type: "video" }).videoFormats).toEqual([
    replacement,
    second,
  ]);
  expect(buildFilePathCandidates({ downloadPath: "/downloads", title: "title", format: "mp4" })).toEqual([
    "/downloads/title via VidBeep.mp4",
    "/downloads/title via VidBee.mp4",
    "/downloads/title.mp4",
  ]);
  expect(expandSubtitleLanguageAliases(["en", "en-US", "en"])).toEqual([
    "en",
    "en-US",
    "en_US",
    "en-GB",
    "en_GB",
    "eng",
  ]);
});

it("calculates cookie expiry from explicit time and preserves Facebook routing", () => {
  expect(matchCookieSites([{ domain: ".youtube.com", name: "SID", expires: 10 }], 9_000)).toEqual([
    { id: "youtube", label: "YouTube", expired: false },
  ]);
  expect(matchCookieSites([{ domain: ".youtube.com", name: "SID", expires: 10 }], 10_000)).toEqual([
    { id: "youtube", label: "YouTube", expired: true },
  ]);
  expect(inspectNetscapeCookies("bad", 0).status).toBe("invalid");
  expect(resolveMappedProfileSource("https://facebook.com/people/example/123/photos")?.category).toBe("photos");
});

it("retains false cookie flags and the original expiration truthiness", () => {
  expect(
    serializeNetscapeCookies([
      {
        domain: "example.com",
        name: "false-flags",
        value: "value",
        hostOnly: false,
        httpOnly: false,
        session: false,
        secure: false,
        expirationDate: 123.9,
      },
      {
        domain: "example.com",
        name: "true-flags",
        value: "value",
        hostOnly: true,
        httpOnly: true,
        session: true,
        secure: true,
        expirationDate: 123.9,
      },
      { domain: "example.com", name: "omitted", value: "value" },
      {
        domain: ".example.com",
        name: "dotted",
        value: "value",
        hostOnly: false,
        session: false,
        expirationDate: 123.9,
      },
      { domain: "example.com", name: "not-a-number", value: "value", expirationDate: Number.NaN },
      { domain: "example.com", name: "zero", value: "value", expirationDate: 0 },
    ])
  ).toBe(
    A.join(
      [
        "# Netscape HTTP Cookie File",
        "# This file was generated by VidBeep",
        "",
        ".example.com\tTRUE\t/\tFALSE\t123\tfalse-flags\tvalue",
        "#HttpOnly_example.com\tFALSE\t/\tTRUE\t0\ttrue-flags\tvalue",
        ".example.com\tTRUE\t/\tFALSE\t0\tomitted\tvalue",
        ".example.com\tTRUE\t/\tFALSE\t123\tdotted\tvalue",
        ".example.com\tTRUE\t/\tFALSE\t0\tnot-a-number\tvalue",
        ".example.com\tTRUE\t/\tFALSE\t0\tzero\tvalue",
        "",
      ],
      "\n"
    )
  );
});
