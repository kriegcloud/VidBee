import {
	isFacebookGalleryUrl,
	isFacebookReelsUrl,
	isInstagramProfileUrl,
	isPlaylistLikeUrl,
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
