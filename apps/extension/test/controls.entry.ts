import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { extensionNavigationLayer } from "../src/ExtensionNavigation.driver.js";
import { ExtensionNavigation } from "../src/ExtensionNavigation.service.js";
import { incrementRetry, makePopupCommands } from "../src/PopupCommands.js";
// Compose the actual navigation driver and commands; only the host setter is fake.
export const createControls = ({
  currentUrl,
  assign,
  retry,
}: {
  readonly currentUrl: string;
  readonly assign: (uri: string) => void;
  readonly retry: (update: (count: number) => number) => void;
}) => {
  const runtime = ManagedRuntime.make(extensionNavigationLayer(assign));
  const navigation = runtime.runSync(ExtensionNavigation);
  const commands = makePopupCommands({
    currentUrl: () => currentUrl,
    navigation,
    retry: Effect.sync(() => retry(incrementRetry)),
  });
  return {
    handleOpenClient: () => runtime.runSync(commands.download),
    handleOpenClientAndRetry: () => runtime.runPromise(commands.openClientAndRetry),
    handleRetry: () => runtime.runSync(commands.retry),
    inspectDownload: () => runtime.runSync(Effect.result(commands.download)),
    close: () => runtime.dispose(),
  };
};
