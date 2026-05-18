import { defineConfig } from "vitest/config"

/**
 * CLI end-to-end suite. These tests spawn the real gxdev binary, run a real
 * `npm install`, and boot the dev server. They are slow (minutes) and require
 * network access for the install step, so they are gated behind RUN_CLI_E2E=1
 * and live in their own config so the fast unit suite stays fast.
 *
 * Run locally: RUN_CLI_E2E=1 npx vitest run --config vitest.e2e.config.js
 * In CI: triggered by .github/workflows/ci.yml (e2e job) and release.yml.
 */
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/e2e/**/*.test.js"],
		// Each test step can take 30s+ (install, vite boot). Don't let the
		// default 5s timeout blow them up.
		testTimeout: 240_000,
		hookTimeout: 300_000,
		// Tests share an installed fixture project — running them in parallel
		// would race on the same node_modules, dist/, and dev-server port.
		// `singleFork` is the vitest-4 replacement for the old
		// `poolOptions.forks.singleFork` knob.
		fileParallelism: false,
		pool: "forks",
		singleFork: true,
	},
})
