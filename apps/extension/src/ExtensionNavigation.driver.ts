import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ExtensionHostFailure } from "./Extension.errors.js";
import { ExtensionNavigation } from "./ExtensionNavigation.service.js";
export const extensionNavigationLayer = (assign: (uri: string) => void) =>
  Layer.succeed(ExtensionNavigation, {
    assign: Effect.fn("ExtensionNavigation.assign")((uri) =>
      Effect.try({
        try: () => assign(uri),
        catch: () =>
          ExtensionHostFailure.make({
            operation: "navigation",
            cause: "Navigation assignment failed",
            message: "Navigation assignment failed",
          }),
      })
    ),
  });
