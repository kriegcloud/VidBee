import type { RcFile } from 'syncpack'

// Every third-party version lives once in the root `catalog` (package.json).
// Workspace manifests reference it with `catalog:` and each other with
// `workspace:^`. Add a dependency by putting its range in the catalog, then
// `"name": "catalog:"` in the consuming package; `bun run deps:check` enforces it.
const config = {
  source: ['package.json', 'apps/*/package.json', 'packages/*/package.json'],
  customTypes: {
    catalog: {
      path: 'catalog',
      strategy: 'versionsByName'
    },
    // Syncpack has no built-in type for optionalDependencies (sherpa-onnx natives).
    optional: {
      path: 'optionalDependencies',
      strategy: 'versionsByName'
    }
  },
  versionGroups: [
    // electron-builder reads apps/desktop/package.json literally, so one spec there
    // cannot be `catalog:`. With a hoisted layout apps/desktop/node_modules/electron
    // does not exist, so build and install-app-deps fall back to the manifest's
    // `electron` spec, which must be an exact version. It mirrors the exact catalog
    // pin, enforced by the groups below.
    {
      label: 'Root electron uses the catalog',
      dependencies: ['electron'],
      packages: ['vidbee-workspace'],
      dependencyTypes: ['dev'],
      pinVersion: 'catalog:'
    },
    {
      label: 'Desktop electron mirrors the exact catalog version',
      dependencies: ['electron'],
      dependencyTypes: ['catalog', 'dev'],
      preferVersion: 'highestSemver'
    },
    {
      label: 'Catalog (Pinned)',
      dependencies: ['**'],
      dependencyTypes: ['catalog'],
      preferVersion: 'highestSemver'
    },
    {
      // Private manifests that are never consumed as dependencies keep whatever
      // version upstream gives them.
      label: 'Local package versions are not policed',
      dependencies: ['**'],
      dependencyTypes: ['local'],
      isIgnored: true
    },
    {
      label: 'Workspace packages use workspace: protocol',
      dependencies: ['@vidbee/**'],
      packages: ['**'],
      dependencyTypes: ['dev', 'prod', 'optional'],
      pinVersion: 'workspace:^'
    },
    {
      label: 'Peer dependencies allow broader ranges',
      dependencies: ['**'],
      dependencyTypes: ['peer'],
      isIgnored: true
    },
    {
      label: 'Third-party dependencies use catalog references',
      dependencies: ['!@vidbee/**'],
      packages: ['**'],
      dependencyTypes: ['dev', 'prod', 'optional'],
      pinVersion: 'catalog:'
    }
  ]
} satisfies RcFile

export default config
