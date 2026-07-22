import dotenv from 'dotenv'
import '@testing-library/jest-dom/vitest'

// Vitest doesn't auto-load env files. Loading .env.local here (when present)
// lets tests/lib/db.test.ts's DATABASE_URL-gated live query actually run
// against a real local Postgres instead of always skipping; in CI/environments
// without .env.local this is a no-op and the test still skips as before.
dotenv.config()
dotenv.config({ path: '.env.local', override: true })
