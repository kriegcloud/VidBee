import { expect, it } from "@effect/vitest";
import { toPlaywrightCookies } from "../src/cookies.js";
import { capturePageUrl } from "../src/drm.js";
import {
  chatVideoByOrdinal,
  onlyFansChatMediaResponse,
  onlyFansChatResponse,
  onlyFansPurchasedResponse,
} from "../src/onlyfans-profile.js";
import { evenSize } from "../src/quality.js";

it("supports both declared forms of every native dual helper", () => {
  expect(evenSize(1080)(1919)).toEqual(evenSize(1919, 1080));
  const chat = "https://onlyfans.com/my/chats/chat/7?firstId=2#hash";
  expect(capturePageUrl(2)(chat)).toBe(capturePageUrl(chat, 2));
  expect(capturePageUrl(undefined)(chat)).toBe(capturePageUrl(chat));
  const payload = { list: [{ id: 1, media: [{ id: 2, type: "video", duration: 3 }] }] };
  expect(chatVideoByOrdinal(1)(payload)).toEqual(chatVideoByOrdinal(payload, 1));
  const messages = new URL("https://onlyfans.com/api2/v2/chats/7/messages");
  const media = new URL("https://onlyfans.com/api2/v2/chats/7/media");
  const purchased = new URL("https://onlyfans.com/api2/v2/posts/paid?userId=7");
  expect(onlyFansChatResponse("7")(messages)).toBe(onlyFansChatResponse(messages, "7"));
  expect(onlyFansChatMediaResponse("7", "videos")(media)).toBe(onlyFansChatMediaResponse(media, "7", "videos"));
  expect(onlyFansChatMediaResponse("7")(media)).toBe(onlyFansChatMediaResponse(media, "7"));
  expect(onlyFansPurchasedResponse("7")(purchased)).toBe(onlyFansPurchasedResponse(purchased, "7"));
  const rows = [
    {
      domain: ".synthetic.invalid",
      path: "/",
      secure: true,
      expires: 2000,
      name: "synthetic",
      value: "value",
      httpOnly: true,
    },
  ];
  expect(toPlaywrightCookies(1000)(rows)).toEqual(toPlaywrightCookies(rows, 1000));
});
