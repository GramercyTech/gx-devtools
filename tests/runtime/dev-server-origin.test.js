import { describe, it, expect } from "vitest"
import { getDevServerBaseUrl } from "../../runtime/devServerOrigin.js"

describe("dev asset origin", () => {
	it.each([
		"https://session.dev.gxp.test",
		"https://session.preview.example.com",
	])("uses preview origin %s", (origin) => {
		expect(
			getDevServerBaseUrl({
				VITE_DEV_SERVER_ORIGIN: origin + "/",
				VITE_USE_HTTPS: "false",
			}),
		).toBe(origin)
	})
	it("preserves the extension localhost default", () => {
		expect(getDevServerBaseUrl()).toBe("https://localhost:3060")
		expect(
			getDevServerBaseUrl({ VITE_USE_HTTPS: "false", VITE_NODE_PORT: "4000" }),
		).toBe("http://localhost:4000")
	})
	it.each([
		"javascript:alert(1)",
		"https://user:pass@example.com",
		"https://example.com/path",
		"https://example.com?token=x",
		"https://example.com#x",
		"/relative",
	])("rejects invalid origin %s", (origin) => {
		expect(() =>
			getDevServerBaseUrl({ VITE_DEV_SERVER_ORIGIN: origin }),
		).toThrow()
	})
})
