import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['bin/lib/**/*.js'],
      exclude: ['bin/lib/tui/**']
    },
    testTimeout: 10000,
  },
});
