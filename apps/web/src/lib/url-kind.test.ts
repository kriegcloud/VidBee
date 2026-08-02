import { isInstagramProfileUrl } from "@vidbee/ui/lib/url-kind";
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
