/**
 * jest.config.js — GiftHint
 *
 * Uses ts-jest so TypeScript files are transpiled by Jest without a separate
 * build step. The moduleNameMapper mirrors the @/* path alias in tsconfig.json
 * so imports like `@/lib/affiliate` resolve correctly inside tests.
 *
 * Written as .js (not .ts) so Jest can parse it without ts-node.
 */

/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Map @/* → project root, matching tsconfig.json "paths"
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Only scan the tests/ directory (keeps test runs fast)
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  // Show each test name as it passes/fails
  verbose: true,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      // tsconfig.json uses jsx:"preserve" for Next.js — override for Jest so
      // that ts-jest can compile JSX in React components imported by tests.
      tsconfig: { jsx: 'react-jsx' },
    }],
  },
}

module.exports = config
