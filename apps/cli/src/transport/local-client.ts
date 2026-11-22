import * as Effect from "effect/Effect";
import { CliLocal } from "../CliLocal.service.js";
import type { LocalClientOptions } from "../Connection.model.js";

export type { LocalClientOptions, LocalSession } from "../Connection.model.js";
export const createLocalClient = Effect.fn("createLocalClient")(function* (options: LocalClientOptions = {}) {
  return yield* (yield* CliLocal).open(options);
});
