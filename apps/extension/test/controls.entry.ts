import * as Effect from "effect/Effect";
import { ExtensionHostFailure } from "../src/Extension.errors.js";
import { incrementRetry, makePopupCommands } from "../src/PopupCommands.js";
// Test composition adapter for the original closure-only control oracle.
// Production and this adapter execute the same Effect commands.
export const createControls = ({
  currentUrl,
  assign,
  retry,
}: {
  readonly currentUrl: string;
  readonly assign: (uri: string) => void;
  readonly retry: (update: (count: number) => number) => void;
}) => {
  const commands = makePopupCommands({
    currentUrl: () => currentUrl,
    navigation: {
      assign: (uri) =>
        Effect.try({
          try: () => assign(uri),
          catch: () =>
            ExtensionHostFailure.make({
              operation: "navigation",
              cause: "Navigation assignment failed",
              message: "Navigation assignment failed",
            }),
        }),
    },
    retry: Effect.sync(() => retry(incrementRetry)),
  });
  return {
    handleOpenClient: () => Effect.runSync(commands.download),
    handleOpenClientAndRetry: () => Effect.runPromise(commands.openClientAndRetry),
    handleRetry: () => Effect.runSync(commands.retry),
  };
};
