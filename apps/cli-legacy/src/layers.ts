import * as NodeServices from '@effect/platform-node/NodeServices';
import { DownloadFilesLive } from '@vidbee/downloader-core/DownloadFiles.layer';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';
import {
  CliHostLive, CliPidLivenessLive, CliDescriptorLive, CliAutostartLive,
  CliAutomationLive, CliConnectionLive, CliProbeLive, CliVersionLive,
  CliUpgradeLive, CliRegistryLive, CliOutputLive, CliProgramLive,
} from '@vidbee/cli';
import { CliLocalHost } from './Local.layer.js';
import { CliLauncherHost, CliProbeProcessHost } from './Process.layer.js';
export const hostLayers = (inputs: { platform: string; homeDirectory: string; executingArtifactUrl: URL }) => {
  const base = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer, CliHostLive(inputs), CliPidLivenessLive, CliLauncherHost, CliProbeProcessHost, CliLocalHost);
  const files = Layer.mergeAll(base, DownloadFilesLive.pipe(Layer.provide(base)));
  const registry = Layer.mergeAll(files, CliRegistryLive.pipe(Layer.provide(files)));
  const readers = Layer.mergeAll(files, CliDescriptorLive.pipe(Layer.provide(files)), CliAutomationLive.pipe(Layer.provide(files)), CliProbeLive.pipe(Layer.provide(files)), CliVersionLive.pipe(Layer.provide(files)), CliUpgradeLive.pipe(Layer.provide(registry)), CliOutputLive.pipe(Layer.provide(files)));
  const autostart = Layer.mergeAll(readers, CliAutostartLive.pipe(Layer.provide(readers)));
  const connection = Layer.mergeAll(autostart, CliConnectionLive.pipe(Layer.provide(autostart)));
  return Layer.mergeAll(connection, CliProgramLive.pipe(Layer.provide(connection)));
};
