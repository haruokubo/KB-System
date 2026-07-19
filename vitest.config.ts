import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // next@16.2.10 ships no package.json#exports map, so Vite's strict ESM
      // resolver can't resolve the extensionless `next/server` import that
      // next-auth uses internally (Next's own bundler tolerates this; Vite's
      // Node-spec-conformant resolver does not). Point directly at the file
      // until upstream adds an exports map or next-auth stops relying on
      // bundler-only resolution.
      'next/server': path.resolve(__dirname, 'node_modules/next/server.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Bumped from vitest's 5000ms default: a bcrypt cost-12 hashing test in
    // tests/lib/users.test.ts was seen to time out once under full-suite
    // load. CI runners can be slower/noisier than local dev, so give tests
    // more headroom to reduce flake odds.
    testTimeout: 10000,
    setupFiles: ['./tests/setup.ts'],
    // Exclude .claude/ so an orphaned git worktree or agent scratch space
    // under it can never be silently picked up and double-run/diverge from
    // the real suite (bit once by exactly this during development).
    exclude: [...configDefaults.exclude, '.claude/**'],
    server: {
      // Force next-auth through Vite's transform/resolve pipeline (so the
      // `next/server` alias above applies) instead of letting Node's native
      // ESM loader resolve it directly, which fails — see the alias comment.
      deps: { inline: ['next-auth', '@auth/core'] },
    },
  },
})
