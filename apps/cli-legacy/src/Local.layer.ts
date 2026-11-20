import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as S from 'effect/Schema';
import { CliLocal, CliFailure } from '@vidbee/cli';
import type { LocalSession } from '@vidbee/cli';
import { createLocalClient } from './local-client.js';
const failure = (cause: unknown) => CliFailure.make({ message: cause instanceof Error ? cause.message : String(cause), cause });
export const CliLocalHost = Layer.succeed(CliLocal, {
  open: (options = {}) => Effect.tryPromise({
    try: async () => {
      const owner = await createLocalClient(options);
      const invoke = <A>(operation: () => Promise<A>) => Effect.tryPromise({ try: operation, catch: failure });
      const id = S.decodeUnknownEffect(S.String);
      const session: LocalSession = {
        shutdown: Effect.promise(owner.shutdown),
        list: (input) => invoke(() => owner.list(input)),
        get: (value) => id(value).pipe(Effect.mapError(failure), Effect.flatMap((value) => invoke(() => owner.get(value)))),
        stats: invoke(owner.stats),
        removeFromHistory: (value) => id(value).pipe(Effect.mapError(failure), Effect.flatMap((value) => invoke(() => owner.removeFromHistory(value)))),
        add: (request) => invoke(() => { if (!owner.add) throw new Error('transport does not support add()'); return owner.add(request); }),
        cancel: (value) => id(value).pipe(Effect.mapError(failure), Effect.flatMap((value) => invoke(() => owner.cancel!(value)))),
        pause: (value, reason) => id(value).pipe(Effect.mapError(failure), Effect.flatMap((value) => invoke(() => owner.pause!(value, reason)))),
        resume: (value) => id(value).pipe(Effect.mapError(failure), Effect.flatMap((value) => invoke(() => owner.resume!(value)))),
        retry: (value) => id(value).pipe(Effect.mapError(failure), Effect.flatMap((value) => invoke(() => owner.retry!(value)))),
      };
      return session;
    },
    catch: failure,
  }),
});
