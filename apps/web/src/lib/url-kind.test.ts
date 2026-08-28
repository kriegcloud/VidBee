import {
	isInstagramProfileUrl,
	isVscoGalleryUrl,
} from "@vidbee/ui/lib/url-kind";
import { describe, expect, it } from "vitest";

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
		"https://vsco.co/allybari/images/",
		"https://www.vsco.co/vidbee.example/gallery?utm_source=test",
		"http://ignored:credentials@vsco.co:8080/allybari/gallery",
	])("accepts an exact VSCO profile gallery route: %s", (url) => {
		expect(isVscoGalleryUrl(url)).toBe(true);
	});

	it.each([
		"https://vsco.co/allybari/",
		"https://vsco.co/allybari/journal/",
		"https://vsco.co/allybari/gallery/item-id",
		"https://vsco.co.example.com/allybari/gallery",
		"https://example.com/vsco.co/allybari/gallery",
		"ftp://vsco.co/allybari/gallery",
	])("rejects a non-gallery or rehosted URL: %s", (url) => {
		expect(isVscoGalleryUrl(url)).toBe(false);
	});
});
