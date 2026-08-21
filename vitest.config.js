import { defineConfig } from 'vitest/config'

// Separate from vite.config.js, which is rooted at client/ for the app build.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.js', 'client/**/*.test.js'],
  },
})
