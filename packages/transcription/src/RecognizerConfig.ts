import * as Effect from "effect/Effect";
import { Models } from "./Models.service.js";
import { make } from "./RecognizerConfig.layer.js";
import { RecognizerModels } from "./RecognizerConfig.service.js";
import type { AsrTierId, SherpaExecutionProvider } from "./Literal.model.js";
/** Worker probe settings over the same borrowed manager and shared config kernel. */
export const recognizerConfig = Effect.fn("WorkerRecognizerConfig")(function* (
  tier: AsrTierId,
  provider: SherpaExecutionProvider
) {
  const models = yield* Models;
  const config = yield* make().pipe(
    Effect.provideService(RecognizerModels, {
      incompleteModelIssue: models.incompleteModelIssue,
      pathByRole: models.pathByRole,
    })
  );
  return yield* config.tryConfig({ tier, numThreads: 1, provider, debug: provider === "cpu" ? 0 : 1 });
});
