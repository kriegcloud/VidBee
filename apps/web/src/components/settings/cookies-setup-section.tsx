import {
	buildBrowserCookiesSetting,
	parseBrowserCookiesSetting,
} from "@vidbee/downloader-core/browser-cookies-setting";
import {
	COOKIES_CHROME_EXTENSION_URL,
	COOKIES_FIREFOX_EXTENSION_URL,
	COOKIES_GUIDE_URL,
	type CookieBrowserId,
	hasConfiguredCookieSettings,
	listSelectableCookieBrowsers,
	recommendCookieSetup,
} from "@vidbee/downloader-core/cookie-setup";
import { Button } from "@vidbee/ui/components/ui/button";
import { Input } from "@vidbee/ui/components/ui/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "@vidbee/ui/components/ui/item";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@vidbee/ui/components/ui/select";
import { Cookie } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { WebAppSettings } from "../../lib/web-settings";

interface CookiesSetupSectionProps {
	platform: string;
	settings: WebAppSettings;
	updateSettings: (updates: Partial<WebAppSettings>) => void;
	onSelectCookiesFile: () => void;
	cookiesFileUploading: boolean;
}

/**
 * Translate a browser id using shared settings labels.
 *
 * @param browser Browser id.
 * @param t i18n function.
 */
const browserLabel = (browser: string, t: (key: string) => string): string => {
	if (!browser || browser === "none") {
		return t("settings.none");
	}
	return t(`settings.browserOptions.${browser}`);
};

/**
 * Guided cookies setup for the web settings page.
 */
export const CookiesSetupSection = ({
	platform,
	settings,
	updateSettings,
	onSelectCookiesFile,
	cookiesFileUploading,
}: CookiesSetupSectionProps) => {
	const { t } = useTranslation();
	const parsed = parseBrowserCookiesSetting(settings.browserForCookies);
	const selectableBrowsers = useMemo(
		() => listSelectableCookieBrowsers(platform),
		[platform],
	);
	const recommendation = useMemo(
		() => recommendCookieSetup({ installedBrowsers: [], platform }),
		[platform],
	);
	const configured = hasConfiguredCookieSettings(
		settings.browserForCookies,
		settings.cookiesPath,
	);
	const usingBrowser =
		parsed.browser !== "none" &&
		selectableBrowsers.includes(parsed.browser as CookieBrowserId);

	const recommendedBrowser =
		recommendation.method === "browser" ? recommendation.browser : undefined;
	const recommendedTitle = recommendedBrowser
		? t("settings.cookiesSetup.recommendedUseBrowser", {
				browser: browserLabel(recommendedBrowser, t),
			})
		: t("settings.cookiesSetup.recommendedImportFile");
	const recommendedHint =
		recommendation.reason === "windows-file"
			? t("settings.cookiesSetup.recommendedImportFileWindowsHint")
			: recommendation.reason === "windows-firefox"
				? t("settings.cookiesSetup.recommendedFirefoxHint")
				: recommendedBrowser
					? t("settings.cookiesSetup.recommendedUseBrowserHint", {
							browser: browserLabel(recommendedBrowser, t),
						})
					: t("settings.cookiesSetup.recommendedImportFileHint");

	/**
	 * Open the public cookies guide or export-extension page.
	 *
	 * @param url Destination URL.
	 */
	const handleOpenLink = (url: string): void => {
		if (typeof window === "undefined") {
			return;
		}
		window.open(url, "_blank", "noopener,noreferrer");
	};

	/**
	 * Apply a supported browser as the cookie source.
	 *
	 * @param browser Browser id.
	 */
	const applyBrowser = (browser: string): void => {
		updateSettings({
			browserForCookies: buildBrowserCookiesSetting(browser, ""),
			cookiesPath: "",
		});
		toast.success(t("settings.cookiesSetup.applied"));
	};

	const statusTitle = usingBrowser
		? t("settings.cookiesSetup.statusUsingBrowser", {
				browser: browserLabel(parsed.browser, t),
			})
		: settings.cookiesPath
			? t("settings.cookiesSetup.statusUsingFile")
			: t("settings.cookiesSetup.statusNotConfigured");

	return (
		<div className="space-y-4">
			<ItemGroup>
				<Item variant="muted">
					<ItemContent>
						<div className="flex flex-wrap items-center gap-2">
							<Cookie className="h-4 w-4 text-muted-foreground" />
							<ItemTitle>{statusTitle}</ItemTitle>
						</div>
						<ItemDescription>
							{configured
								? settings.cookiesPath
									? t("settings.cookiesSetup.healthOkFileGeneric")
									: t("settings.cookiesSetup.healthOkBrowser", {
											browser: browserLabel(parsed.browser, t),
										})
								: t("settings.cookiesSetup.statusNotConfiguredHint")}
						</ItemDescription>
					</ItemContent>
					<ItemActions>
						{configured ? (
							<Button
								onClick={() =>
									updateSettings({ browserForCookies: "none", cookiesPath: "" })
								}
								size="sm"
								variant="secondary"
							>
								{t("settings.cookiesSetup.clearSetup")}
							</Button>
						) : null}
					</ItemActions>
				</Item>
			</ItemGroup>

			{!configured ? (
				<ItemGroup>
					<Item variant="muted">
						<ItemContent>
							<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
								{t("settings.cookiesSetup.recommendedTitle")}
							</p>
							<ItemTitle>{recommendedTitle}</ItemTitle>
							<ItemDescription>{recommendedHint}</ItemDescription>
						</ItemContent>
						<ItemActions>
							{recommendedBrowser ? (
								<Button onClick={() => applyBrowser(recommendedBrowser)}>
									{t("settings.cookiesSetup.useThisBrowser", {
										browser: browserLabel(recommendedBrowser, t),
									})}
								</Button>
							) : (
								<Button
									disabled={cookiesFileUploading}
									onClick={onSelectCookiesFile}
								>
									{cookiesFileUploading
										? t("download.loading")
										: t("settings.cookiesSetup.importFile")}
								</Button>
							)}
						</ItemActions>
					</Item>
				</ItemGroup>
			) : null}

			<ItemGroup>
				<Item variant="muted">
					<ItemContent>
						<ItemTitle>{t("settings.browserForCookies")}</ItemTitle>
						<ItemDescription>
							{t("settings.browserForCookiesDescription")}
						</ItemDescription>
					</ItemContent>
					<ItemActions>
						<Select
							onValueChange={(value) => {
								if (value === "none") {
									updateSettings({ browserForCookies: "none" });
									return;
								}
								applyBrowser(value);
							}}
							value={
								selectableBrowsers.includes(parsed.browser as CookieBrowserId)
									? parsed.browser
									: "none"
							}
						>
							<SelectTrigger className="w-36">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">{t("settings.none")}</SelectItem>
								{selectableBrowsers.map((browser) => (
									<SelectItem key={browser} value={browser}>
										{browserLabel(browser, t)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</ItemActions>
				</Item>
			</ItemGroup>

			<ItemGroup>
				<Item variant="muted">
					<ItemContent>
						<ItemTitle>{t("settings.cookiesFile")}</ItemTitle>
						<ItemDescription>
							{t("settings.cookiesSetup.recommendedImportFileHint")}
						</ItemDescription>
						<div className="flex flex-wrap gap-3 pt-1">
							<Button
								className="px-0"
								onClick={() => handleOpenLink(COOKIES_CHROME_EXTENSION_URL)}
								variant="link"
							>
								{t("settings.cookiesSetup.fileExportExtension")}
							</Button>
							<Button
								className="px-0"
								onClick={() => handleOpenLink(COOKIES_FIREFOX_EXTENSION_URL)}
								variant="link"
							>
								{t("settings.browserOptions.firefox")}
							</Button>
						</div>
					</ItemContent>
					<ItemActions>
						<div className="flex w-full max-w-md gap-2">
							<Input className="flex-1" readOnly value={settings.cookiesPath} />
							<Button
								disabled={cookiesFileUploading}
								onClick={onSelectCookiesFile}
							>
								{cookiesFileUploading
									? t("download.loading")
									: t("settings.selectPath")}
							</Button>
						</div>
					</ItemActions>
				</Item>
			</ItemGroup>

			<ItemGroup>
				<Item variant="muted">
					<ItemContent>
						<ItemTitle>{t("settings.cookiesGuideTitle")}</ItemTitle>
						<ItemDescription>
							{t("settings.cookiesGuideDescription")}
						</ItemDescription>
					</ItemContent>
					<ItemActions>
						<Button
							className="px-0"
							onClick={() => handleOpenLink(COOKIES_GUIDE_URL)}
							variant="link"
						>
							{t("settings.cookiesGuideLink")}
						</Button>
					</ItemActions>
				</Item>
			</ItemGroup>
		</div>
	);
};
