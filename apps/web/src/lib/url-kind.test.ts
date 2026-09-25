import {
	isDzenProfileUrl,
	isFacebookGalleryUrl,
	isFacebookReelsUrl,
	isInstagramProfileUrl,
	isOnlyFansChatListUrl,
	isOnlyFansListUrl,
	isOnlyFansPostUrl,
	isOnlyFansProfileUrl,
	isPlaylistLikeUrl,
	isThreadsUrl,
	isTikTokPhotoUrl,
	isVscoGalleryUrl,
} from "@vidbee/ui/lib/url-kind";
import { describe, expect, it } from "vitest";

describe("Facebook profile reels", () => {
	it.each([
		"https://www.facebook.com/makenzeebush/reels",
		"https://www.facebook.com/makenzeebush/reels/?sk=reels",
		"https://m.facebook.com/123/reels",
		"https://mbasic.facebook.com/example.name/reels/",
		"http://web.facebook.com/example/reels#videos",
	])("opens the video playlist flow: %s", (url) => {
		expect(isFacebookReelsUrl(url)).toBe(true);
		expect(isPlaylistLikeUrl(url)).toBe(true);
		expect(isFacebookGalleryUrl(url)).toBe(false);
	});
	it.each([
		"https://www.facebook.com/reel/123",
		"https://www.facebook.com/example/photos",
		"https://www.facebook.com/example/reels/123",
		"https://www.facebook.com/groups/reels",
		"https://www.facebook.com/share/reels",
		"https://facebook.com.example.org/example/reels",
		"https://example.org/example/reels",
		"https://ignored:credentials@www.facebook.com/example/reels",
		"https://www.facebook.com:8080/example/reels",
		"ftp://www.facebook.com/example/reels",
	])(
		"does not claim another resource as a Facebook reels playlist: %s",
		(url) => {
			expect(isFacebookReelsUrl(url)).toBe(false);
		},
	);
});

describe("isFacebookGalleryUrl", () => {
	it.each([
		"https://www.facebook.com/profile.php?id=100011267106830&sk=photos",
		"https://m.facebook.com/example/photos/",
		"https://www.facebook.com/media/set/?set=a.123",
		"https://www.facebook.com/photo.php?fbid=123&set=a.456",
	])("routes photos through the shared gallery flow: %s", (url) => {
		expect(isFacebookGalleryUrl(url)).toBe(true);
	});
	it.each([
		"https://www.facebook.com/watch/?v=123",
		"https://www.facebook.com/reel/123",
		"https://facebook.com.example.org/example/photos/",
	])("preserves video routes and rejects lookalike hosts: %s", (url) => {
		expect(isFacebookGalleryUrl(url)).toBe(false);
	});
});

describe("isInstagramProfileUrl", () => {
	it.each([
		"https://instagram.com/vidbee/",
		"https://www.instagram.com/vidbee.example?hl=en",
		"https://m.instagram.com/vid_bee/",
	])("accepts an Instagram profile root: %s", (url) => {
		expect(isInstagramProfileUrl(url)).toBe(true);
	});

	it.each([
		"https://www.instagram.com/p/ABC123/",
		"https://www.instagram.com/reel/ABC123/",
		"https://www.instagram.com/stories/vidbee/123/",
		"https://www.instagram.com/vidbee/tagged/",
		"https://example.com/vidbee/",
	])("rejects an individual item or non-Instagram URL: %s", (url) => {
		expect(isInstagramProfileUrl(url)).toBe(false);
	});
});

describe("isTikTokPhotoUrl", () => {
	it.each([
		"https://www.tiktok.com/@chillezy/photo/7240568259186019630",
		"https://tiktok.com/@hull.city_1904/photo/7553302113757990166/?lang=en",
		"https://m.tiktok.com/@memezar/photo/7449708266168274208#top",
		"https://www.tiktok.com/share/photo/7449708266168274208",
	])("downloads a photo-mode post as an image set: %s", (url) => {
		expect(isTikTokPhotoUrl(url)).toBe(true);
		expect(isPlaylistLikeUrl(url)).toBe(false);
	});

	it.each([
		"https://www.tiktok.com/@tiktok/video/7683195368279985438",
		"https://www.tiktok.com/@tiktok",
		"https://vm.tiktok.com/ZMabc123/",
		"https://www.tiktok.com/@tiktok/photo/abc",
		"https://tiktok.com.example.org/@tiktok/photo/7240568259186019630",
		"ftp://www.tiktok.com/@tiktok/photo/7240568259186019630",
	])("keeps %s on the single-video path", (url) => {
		expect(isTikTokPhotoUrl(url)).toBe(false);
	});
});

describe("isVscoGalleryUrl", () => {
	it.each([
		"https://vsco.co/allybari/gallery",
		"https://vsco.co/elizabethpaigee",
		"https://vsco.co/allybari/",
		"https://vsco.co/allybari/images/",
		"https://www.vsco.co/vidbee.example/gallery?utm_source=test",
		"http://ignored:credentials@vsco.co:8080/allybari/gallery",
	])("accepts an exact VSCO profile gallery route: %s", (url) => {
		expect(isVscoGalleryUrl(url)).toBe(true);
	});

	it.each([
		"https://vsco.co/allybari/journal/",
		"https://vsco.co/allybari/gallery/item-id",
		"https://vsco.co.example.com/allybari/gallery",
		"https://example.com/vsco.co/allybari/gallery",
		"ftp://vsco.co/allybari/gallery",
	])("rejects a non-gallery or rehosted URL: %s", (url) => {
		expect(isVscoGalleryUrl(url)).toBe(false);
	});
});

describe("isOnlyFansPostUrl", () => {
	it.each([
		"https://onlyfans.com/2669829379/kenzeygrey",
		"https://www.onlyfans.com/2669829379/creator.name/",
	])("routes a post gallery through the playlist flow: %s", (url) => {
		expect(isOnlyFansPostUrl(url)).toBe(true);
		expect(isPlaylistLikeUrl(url)).toBe(true);
	});

	it.each([
		"https://onlyfans.com/",
		"https://onlyfans.com.example.org/2669829379/kenzeygrey",
		"ftp://onlyfans.com/2669829379/kenzeygrey",
		"https://onlyfans.com/2669829379/kenzeygrey/media/3743089366",
	])("keeps %s off the post-gallery playlist path", (url) => {
		expect(isOnlyFansPostUrl(url)).toBe(false);
		expect(isOnlyFansListUrl(url)).toBe(false);
		expect(isPlaylistLikeUrl(url)).toBe(false);
	});
});

describe("isOnlyFansListUrl", () => {
	it.each([
		"https://onlyfans.com/kenzeygrey",
		"https://onlyfans.com/kenzeygrey/media",
		"https://onlyfans.com/kenzeygrey/photos",
		"https://onlyfans.com/kenzeygrey/videos",
	])("routes a profile feed through the playlist flow: %s", (url) => {
		expect(isOnlyFansProfileUrl(url)).toBe(true);
		expect(isOnlyFansListUrl(url)).toBe(true);
		expect(isPlaylistLikeUrl(url)).toBe(true);
	});

	it.each([
		"https://onlyfans.com/my/chats/chat/123456",
		"https://onlyfans.com/my/chats/chat/123456/gallery",
		"https://onlyfans.com/my/chats/chat/123456/gallery/opened",
		"https://onlyfans.com/my/chats/chat/123456/gallery/purchased",
		"https://onlyfans.com/my/chats/chat/123456/gallery/photos",
		"https://onlyfans.com/my/chats/chat/123456/gallery/videos",
	])("routes a chat inventory through the playlist flow: %s", (url) => {
		expect(isOnlyFansChatListUrl(url)).toBe(true);
		expect(isOnlyFansListUrl(url)).toBe(true);
		expect(isPlaylistLikeUrl(url)).toBe(true);
	});

	it("does not treat a single chat media URL as a list page", () => {
		expect(
			isOnlyFansChatListUrl(
				"https://onlyfans.com/my/chats/chat/123456/media/99",
			),
		).toBe(false);
	});

	it.each([
		"https://onlyfans.com/my",
		"https://onlyfans.com/2669829379/kenzeygrey",
		"https://onlyfans.com/kenzeygrey/posts",
	])("keeps %s off the profile list path", (url) => {
		expect(isOnlyFansProfileUrl(url)).toBe(false);
		expect(isOnlyFansChatListUrl(url)).toBe(false);
	});
});

describe("isThreadsUrl", () => {
	it.each([
		"https://www.threads.com/@benoppold",
		"https://threads.net/@benoppold/media",
		"https://www.threads.com/@benoppold/post/DdWHZs_ljvz",
	])("recognizes %s for the shared one-click gallery flow", (url) => {
		expect(isThreadsUrl(url)).toBe(true);
	});
	it("excludes replies", () => {
		expect(isThreadsUrl("https://www.threads.com/@benoppold/replies")).toBe(
			false,
		);
	});
});

describe("Dzen profile routing", () => {
	it.each([
		"https://dzen.ru/id/5f272f80ba199a2a3379d0d2",
		"https://www.dzen.ru/tok_media/",
		"https://zen.yandex.ru/tok_media",
	])("routes the whole profile to the shared playlist flow: %s", (url) => {
		expect(isDzenProfileUrl(url)).toBe(true);
		expect(isPlaylistLikeUrl(url)).toBe(true);
		expect(isInstagramProfileUrl(url)).toBe(false);
	});
	it.each([
		"https://dzen.ru/video/watch/62b2294de1a1d65580ced2b1",
		"https://dzen.ru/a/article",
		"https://dzen.ru/search",
		"https://dzen.ru.example.org/tok_media",
	])(
		"does not route an individual item or unrelated resource as a profile: %s",
		(url) => {
			expect(isDzenProfileUrl(url)).toBe(false);
			expect(isPlaylistLikeUrl(url)).toBe(false);
		},
	);
});
