import type { DownloadType } from "@vidbee/downloader-core";
import {
	type FilenameStyle,
	isFilenameStyle,
} from "@vidbee/downloader-core/filename-style";
import {
	DEFAULT_SUBTITLE_LANGUAGES,
	normalizeSubtitleLanguages,
} from "@vidbee/downloader-core/subtitle-languages";
import {
	defaultLanguageCode,
	type LanguageCode,
	normalizeLanguageCode,
} from "@vidbee/i18n/languages";

export type OneClickQualityPreset =
	| "best"
	| "good"
	| "normal"
	| "bad"
	| "worst";

export type OneClickContainerOption =
	| "auto"
	| "mp4"
	| "mkv"
	| "webm"
	| "original";

export type ThemeValue = "light" | "dark" | "system";

export interface WebAppSettings {
	downloadPath: string;
	maxConcurrentDownloads: number;
	browserForCookies: string;
	cookiesPath: string;
	proxy: string;
	configPath: string;
	betaProgram: boolean;
	language: LanguageCode;
	theme: ThemeValue;
	oneClickDownload: boolean;
	oneClickDownloadType: DownloadType;
	oneClickQuality: OneClickQualityPreset;
	oneClickContainer: OneClickContainerOption;
	closeToTray: boolean;
	autoUpdate: boolean;
	subscriptionOnlyLatestDefault: boolean;
	enableAnalytics: boolean;
	downloadSubtitles: boolean;
	subtitleLanguages: string[];
	embedSubs: boolean;
	writeAutoSubs: boolean;
	embedThumbnail: boolean;
	embedMetadata: boolean;
	embedChapters: boolean;
	filenameStyle: FilenameStyle;
	filenameViaVidBee: boolean;
	shareWatermark: boolean;
}

export const WEB_SETTINGS_STORAGE_KEY = "vidbee.web.settings";

export const defaultWebSettings: WebAppSettings = {
	downloadPath: "",
	maxConcurrentDownloads: 5,
	browserForCookies: "none",
	cookiesPath: "",
	proxy: "",
	configPath: "",
	betaProgram: false,
	language: defaultLanguageCode,
	theme: "system",
	oneClickDownload: true,
	oneClickDownloadType: "video",
	oneClickQuality: "best",
	oneClickContainer: "auto",
	closeToTray: true,
	autoUpdate: true,
	subscriptionOnlyLatestDefault: true,
	enableAnalytics: true,
	downloadSubtitles: true,
	subtitleLanguages: [...DEFAULT_SUBTITLE_LANGUAGES],
	embedSubs: true,
	writeAutoSubs: true,
	embedThumbnail: false,
	embedMetadata: true,
	embedChapters: true,
	filenameStyle: "pretty",
	filenameViaVidBee: true,
	shareWatermark: false,
};

const toThemeValue = (value: unknown): ThemeValue => {
	if (value === "dark" || value === "light" || value === "system") {
		return value;
	}
	return defaultWebSettings.theme;
};

const toOneClickQuality = (value: unknown): OneClickQualityPreset => {
	if (
		value === "best" ||
		value === "good" ||
		value === "normal" ||
		value === "bad" ||
		value === "worst"
	) {
		return value;
	}
	return defaultWebSettings.oneClickQuality;
};

const toOneClickContainer = (value: unknown): OneClickContainerOption => {
	if (
		value === "auto" ||
		value === "mp4" ||
		value === "mkv" ||
		value === "webm" ||
		value === "original"
	) {
		return value;
	}
	return defaultWebSettings.oneClickContainer;
};

const toFilenameStyle = (value: unknown): FilenameStyle =>
	isFilenameStyle(value) ? value : defaultWebSettings.filenameStyle;

const toDownloadType = (value: unknown): DownloadType => {
	if (value === "audio" || value === "video") {
		return value;
	}
	return defaultWebSettings.oneClickDownloadType;
};

const toBoolean = (value: unknown, fallback: boolean): boolean =>
	typeof value === "boolean" ? value : fallback;

const toNumber = (value: unknown, fallback: number): number =>
	typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toStringValue = (value: unknown, fallback = ""): string =>
	typeof value === "string" ? value : fallback;

/**
 * Normalize persisted subtitle language selections from local storage.
 *
 * @param value Untrusted local-storage value.
 * @returns A bounded list with the interface-language default.
 */
const toSubtitleLanguages = (value: unknown): string[] =>
	normalizeSubtitleLanguages(
		Array.isArray(value)
			? value.filter((item): item is string => typeof item === "string")
			: undefined,
	);

const parseSettings = (raw: string | null): WebAppSettings => {
	if (!raw) {
		return defaultWebSettings;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<WebAppSettings>;
		return {
			...defaultWebSettings,
			downloadPath: toStringValue(parsed.downloadPath),
			maxConcurrentDownloads: toNumber(
				parsed.maxConcurrentDownloads,
				defaultWebSettings.maxConcurrentDownloads,
			),
			browserForCookies: toStringValue(
				parsed.browserForCookies,
				defaultWebSettings.browserForCookies,
			),
			cookiesPath: toStringValue(parsed.cookiesPath),
			proxy: toStringValue(parsed.proxy),
			configPath: toStringValue(parsed.configPath),
			betaProgram: toBoolean(
				parsed.betaProgram,
				defaultWebSettings.betaProgram,
			),
			language: normalizeLanguageCode(parsed.language),
			theme: toThemeValue(parsed.theme),
			oneClickDownload: toBoolean(
				parsed.oneClickDownload,
				defaultWebSettings.oneClickDownload,
			),
			oneClickDownloadType: toDownloadType(parsed.oneClickDownloadType),
			oneClickQuality: toOneClickQuality(parsed.oneClickQuality),
			oneClickContainer: toOneClickContainer(parsed.oneClickContainer),
			closeToTray: toBoolean(
				parsed.closeToTray,
				defaultWebSettings.closeToTray,
			),
			autoUpdate: toBoolean(parsed.autoUpdate, defaultWebSettings.autoUpdate),
			subscriptionOnlyLatestDefault: toBoolean(
				parsed.subscriptionOnlyLatestDefault,
				defaultWebSettings.subscriptionOnlyLatestDefault,
			),
			enableAnalytics: toBoolean(
				parsed.enableAnalytics,
				defaultWebSettings.enableAnalytics,
			),
			downloadSubtitles: toBoolean(
				parsed.downloadSubtitles,
				defaultWebSettings.downloadSubtitles,
			),
			subtitleLanguages: toSubtitleLanguages(parsed.subtitleLanguages),
			embedSubs: toBoolean(parsed.embedSubs, defaultWebSettings.embedSubs),
			writeAutoSubs: toBoolean(
				parsed.writeAutoSubs,
				defaultWebSettings.writeAutoSubs,
			),
			embedThumbnail: toBoolean(
				parsed.embedThumbnail,
				defaultWebSettings.embedThumbnail,
			),
			embedMetadata: toBoolean(
				parsed.embedMetadata,
				defaultWebSettings.embedMetadata,
			),
			embedChapters: toBoolean(
				parsed.embedChapters,
				defaultWebSettings.embedChapters,
			),
			filenameStyle: toFilenameStyle(parsed.filenameStyle),
			filenameViaVidBee: toBoolean(
				parsed.filenameViaVidBee,
				defaultWebSettings.filenameViaVidBee,
			),
			shareWatermark: toBoolean(
				parsed.shareWatermark,
				defaultWebSettings.shareWatermark,
			),
		};
	} catch {
		return defaultWebSettings;
	}
};

export const readWebSettings = (): WebAppSettings => {
	if (typeof window === "undefined") {
		return defaultWebSettings;
	}

	return parseSettings(window.localStorage.getItem(WEB_SETTINGS_STORAGE_KEY));
};

export const writeWebSettings = (settings: WebAppSettings): void => {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.setItem(
		WEB_SETTINGS_STORAGE_KEY,
		JSON.stringify(settings),
	);
};

export const applyThemeToDocument = (theme: ThemeValue): void => {
	if (typeof window === "undefined") {
		return;
	}

	const root = window.document.documentElement;
	const shouldUseDark =
		theme === "dark" ||
		(theme === "system" &&
			window.matchMedia &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);

	root.classList.toggle("dark", shouldUseDark);
};
