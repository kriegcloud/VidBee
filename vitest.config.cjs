// The contained source oracle mounts dependency inputs read-only. Keep module
// caches disabled; CJS config loading also avoids Vite temporary ESM output.
module.exports = { test: { fsModuleCache: false } }
