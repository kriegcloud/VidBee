import * as Effect from "effect/Effect";
import * as P from "effect/Predicate";
import type * as Context from "effect/Context";
import type { ExtensionNavigation } from "./ExtensionNavigation.service.js";
export const incrementRetry = (count: number) => count + 1;
export const makePopupCommands = ({
  navigation,
  retry,
  currentUrl,
}: {
  readonly navigation: Context.Service.Shape<typeof ExtensionNavigation>;
  readonly retry: Effect.Effect<void>;
  readonly currentUrl: () => string;
}) => ({
  retry,
  download: Effect.suspend(() => {
    const url = currentUrl();
    return P.isTruthy(url) ? navigation.assign(`vidbee://download?url=${encodeURIComponent(url)}`) : Effect.void;
  }),
  openClientAndRetry: navigation.assign("vidbee://").pipe(Effect.andThen(Effect.sleep(2000)), Effect.andThen(retry)),
});
