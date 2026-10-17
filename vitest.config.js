import { defineConfig } from 'vitest/config'

// Tests for the money rules and the maths (npm test). They never touch the database: tests/setup.js
// swaps the Supabase connection for an empty stand-in.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    environment: 'node',
  },
})
