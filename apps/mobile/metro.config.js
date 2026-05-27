const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind }   = require('nativewind/metro')
const path                 = require('path')

const projectRoot  = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// ── Monorepo support ──────────────────────────────────────────────────────────
// Tell Metro to watch the shared package so changes hot-reload.
config.watchFolders = [monorepoRoot]

// Resolve modules from the project root first, then the monorepo root.
// This ensures the mobile app uses its own react-native (not web's).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// Required for @gifthint/shared workspace package resolution
config.resolver.disableHierarchicalLookup = false

module.exports = withNativeWind(config, { input: './global.css' })
