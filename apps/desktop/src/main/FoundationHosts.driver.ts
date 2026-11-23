import { DesktopOperationError } from "../shared/DesktopOperation.errors.js";
import { appHostLayer } from "./AppHost.driver.js";
import { settingsStoreLayer } from "./SettingsStore.driver.js";
import { windowHostLayer } from "./WindowHost.driver.js";
import type { DesktopLogEntry } from "../shared/logging/DesktopLog.model.js";
import type { AppPrimitives } from "./AppHost.driver.js";
import type { SettingsPrimitives } from "./SettingsStore.service.js";
import type { WindowPrimitives } from "./WindowHost.driver.js";

/** Creates application-local late binding slots. Legacy composition installs native hosts at their original import points; pure runtime acquisition cannot eagerly load engines or create a window.
 * **Example** (Install an application host before invoking it)
 * ```ts
 * import { makeFoundationHosts } from './FoundationHosts.driver.js'
 * import type { AppPrimitives } from './AppHost.driver.js'
 * export const install = (native:AppPrimitives) => {
 *   const hosts=makeFoundationHosts(); hosts.app.install(native); return hosts.app.layer;
 * }
 * // Each factory owns separate slots; a missing installation fails at the driver boundary.
 * ```
 * @category drivers
 * @since 0.0.0
 */
export const makeFoundationHosts = () => {
  let settings: SettingsPrimitives | undefined;
  let emit: (entry: DesktopLogEntry) => void = () => {};
  const borrowSettings = () => {
    if (settings === undefined)
      throw DesktopOperationError.make({ operation: "SettingsHost.install", message: "Settings host not installed" });
    return settings;
  };
  let app: AppPrimitives | undefined;
  let window: WindowPrimitives | undefined;
  return {
    logging: {
      install: (sink: (entry: DesktopLogEntry) => void) => {
        emit = sink;
      },
      emit: (entry: DesktopLogEntry) => emit(entry),
    },
    settings: {
      install: (native: SettingsPrimitives) => {
        settings = native;
      },
      layer: settingsStoreLayer({
        open: () => borrowSettings().open(),
        mkdir: (value) => borrowSettings().mkdir(value),
        rememberPortableRoot: () => borrowSettings().rememberPortableRoot(),
        locale: () => borrowSettings().locale(),
        resolve: (value) => borrowSettings().resolve(value),
        relative: (from, to) => borrowSettings().relative(from, to),
        join: (from, to) => borrowSettings().join(from, to),
        isAbsolute: (value) => borrowSettings().isAbsolute(value),
        trim: (value) => borrowSettings().trim(value),
      }),
    },
    app: {
      install: (native: AppPrimitives) => {
        app = native;
      },
      layer: appHostLayer(() => {
        if (app === undefined)
          throw DesktopOperationError.make({ operation: "AppHost.install", message: "Application host not installed" });
        return app;
      }),
    },
    window: {
      install: (native: WindowPrimitives) => {
        window = native;
      },
      layer: windowHostLayer(() => {
        if (window === undefined)
          throw DesktopOperationError.make({ operation: "WindowHost.install", message: "Window host not installed" });
        return window;
      }),
    },
  };
};
