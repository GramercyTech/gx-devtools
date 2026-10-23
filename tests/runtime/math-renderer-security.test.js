import { describe, expect, it } from "vitest"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const requireFromMath = createRequire(
	require.resolve("micromark-extension-math"),
)
const katex = requireFromMath("katex")

describe("patched Markdown math renderer", () => {
	it("preserves rendering through the lint plugin's actual dependency", () => {
		expect(katex.renderToString("x^2 + y^2", { throwOnError: true })).toContain(
			'class="katex"',
		)
	})

	it("does not inherit trusted rendering from an options prototype", () => {
		const output = katex.renderToString(
			"\\href{javascript:alert(1)}{Click}",
			Object.create({ trust: true }),
		)
		expect(output).not.toMatch(/href=["']javascript:/i)
	})

	it("requires an own trust option before rendering an external image", () => {
		const expression = "\\includegraphics{https://synthetic.invalid/math.png}"
		expect(
			katex.renderToString(expression, Object.create({ trust: true })),
		).not.toContain("<img")
		expect(katex.renderToString(expression, { trust: true })).toContain("<img")
	})
})
