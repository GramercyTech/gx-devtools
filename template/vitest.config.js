import { defineConfig } from "vitest/config"
import vue from "@vitejs/plugin-vue"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			"@layouts": path.resolve(__dirname, "theme-layouts"),
		},
	},
	test: {
		globals: true,
		environment: "happy-dom",
		include: [
			"tests/**/*.{test,spec}.{js,mjs,ts}",
			"src/**/*.{test,spec}.{js,mjs,ts}",
		],
		passWithNoTests: true,
	},
})
