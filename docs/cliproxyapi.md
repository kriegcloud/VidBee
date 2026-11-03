# CLIProxyAPI subscriptions

The desktop app can use the local CLIProxyAPI service for transcript skills
(Overview, Generate FAQ, built-in and custom mindmaps), follow-up questions,
and Agent chat. No VidBee Cloud sign-in or provider API key entry is needed.
CLIProxyAPI must already be running and authenticated to your subscriptions.

In Settings → AI providers, add **CLIProxyAPI**, select a model from its live
catalog, save it, and select that provider in the AI composer. The default model
is `gpt-6.1-sol`; transcript skills request medium thinking effort. Existing
failed Cloud results remain in history; use **Try again** after selecting the
provider.

Requests go to `http://127.0.0.1:8317/v1`. The endpoint is fixed so a renderer
cannot redirect the workstation credential to another host. The main process
reads authentication using the same precedence as fx0:

1. `VIDBEE_PROXY_API_KEY`, if explicitly set.
2. `VIDBEE_PROXY_TOKEN_FILE`, or `~/.cli-proxy-api/client-token` by default.
3. `VIDBEE_PROXY_CONFIG`, or `~/.cli-proxy-api/config.yaml`, using the first
   nonempty `api-keys` entry. An explicitly selected config skips the default
   token file. An explicitly selected token file must be readable and nonempty.

The credential is read afresh for requests and is never copied into VidBee's
settings or sent to its renderer. Missing credentials and unavailable proxy
service errors do not switch the request to VidBee Cloud. CLIProxyAPI manages
the subscription login, routing, and limits.

The web app currently has no matching transcript AI provider settings. This
integration runs in Electron's main process and requires the workstation's local
service and files.
