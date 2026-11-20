import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { buildOfflineRecognizerConfig } from "./asr-recognizer.js";
import { asrTierInfo } from "./asr-tiers.js";
import { Models } from "./Models.service.js";
import { RecognizerConfig, RecognizerModels } from "./RecognizerConfig.service.js";
import { HostFailure, ModelUnavailable } from "./Transcription.errors.js";
import type { AsrTierId } from "./Literal.model.js";
export const RecognizerModelsLive = Layer.effect(
  RecognizerModels,
  Effect.map(Models, (models) => ({ incompleteModelIssue: models.incompleteModelIssue, pathByRole: models.pathByRole }))
);
export const make = Effect.fnUntraced(function* () {
  const models = yield* RecognizerModels;
  const paths = Effect.fn("RecognizerConfig.paths")(function* (tier: AsrTierId) {
    const issue = yield* models.incompleteModelIssue(tier);
    const hasIssue = Boolean(issue);
    if (hasIssue && issue !== null)
      return yield* ModelUnavailable.make({ operation: "recognizerPaths", legacyMessage: issue });
    const decoder = yield* models.pathByRole("asr-decoder", tier);
    const encoder = yield* models.pathByRole("asr-encoder", tier);
    const frontend = yield* models.pathByRole("asr-frontend", tier);
    const joiner = yield* models.pathByRole("asr-joiner", tier);
    const model = yield* models.pathByRole("asr-model", tier);
    const tokenizer = yield* models.pathByRole("asr-tokenizer", tier);
    const tokens = yield* models.pathByRole("asr-tokens", tier);
    return { decoder, encoder, frontend, joiner, model, tokenizer, tokens };
  });
  return RecognizerConfig.of({
    paths,
    tryConfig: Effect.fn("RecognizerConfig.tryConfig")(
      function* (input) {
        const family = yield* Effect.try({
          try: () => asrTierInfo(input.tier).family,
          catch: (cause) =>
            HostFailure.make({
              operation: "asrTierInfo",
              cause,
              legacyMessage: cause instanceof Error ? cause.message : String(cause),
            }),
        });
        const modelPaths = yield* paths(input.tier);
        return yield* Effect.try({
          try: () =>
            buildOfflineRecognizerConfig(
              family,
              modelPaths,
              input.numThreads === undefined ? 2 : input.numThreads,
              undefined,
              input.provider === undefined ? "cpu" : input.provider,
              input.debug === undefined ? 0 : input.debug
            ),
          catch: (cause) =>
            HostFailure.make({
              operation: "recognizerConfig",
              cause,
              legacyMessage: cause instanceof Error ? cause.message : String(cause),
            }),
        });
      },
      Effect.orElseSucceed(() => null)
    ),
  });
});
export const RecognizerConfigLive = Layer.effect(RecognizerConfig, make());
