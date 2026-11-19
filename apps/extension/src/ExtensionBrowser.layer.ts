import * as Layer from "effect/Layer";
import { makeBrowserDriver } from "./ExtensionBrowser.driver.js";
import { ExtensionBrowser } from "./ExtensionBrowser.service.js";
import type { BrowserHost } from "./ExtensionBrowser.driver.js";
export const extensionBrowserLayer = (browser: BrowserHost) =>
  Layer.succeed(ExtensionBrowser, makeBrowserDriver(browser));
