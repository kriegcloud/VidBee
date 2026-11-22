import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { AutomationClientOptions } from "./Automation.model.js";
import type { AutomationSession, CliError } from "./Cli.model.js";
export class CliAutomation extends Context.Service<
  CliAutomation,
  { readonly make: (options: AutomationClientOptions) => Effect.Effect<AutomationSession, CliError> }
>()("@vidbee/cli/CliAutomation.service/CliAutomation") {}
