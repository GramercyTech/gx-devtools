import { describe, expect, it } from "vitest"
import { Window } from "happy-dom"
import ECMAScriptModuleCompiler from "../../node_modules/happy-dom/lib/module/ECMAScriptModuleCompiler.js"

describe("Happy DOM module import alias security boundary", () => {
	it("drops an invalid local import alias while preserving valid module execution", async () => {
		// Evaluation is an explicit precondition, confined to this synthetic window.
		// No host process, environment, filesystem or external network is accessed.
		const window = new Window({
			settings: { enableJavaScriptEvaluation: true },
		})
		try {
			const compiler = new ECMAScriptModuleCompiler(window)
			const result = compiler.compile(
				"https://synthetic.example.test/main.js",
				'import { value as validAlias, value as "bad;globalThis.aliasSentinel=1" } from "./dependency.js"; export const ran = validAlias;',
			)
			expect(result.imports).toEqual([
				{ url: "https://synthetic.example.test/dependency.js", type: "esm" },
			])
			const exports = {}
			await result.execute({
				imports: new Map([
					["https://synthetic.example.test/dependency.js", { value: 7 }],
				]),
				exports,
				dispatchError: (error) => {
					throw error
				},
				dynamicImport: async () => {
					throw new Error("Unexpected synthetic import")
				},
				importMeta: {
					url: "https://synthetic.example.test/main.js",
					resolve: (value) => value,
				},
				addCircularImportResolver: () => {},
			})
			expect(exports.ran).toBe(7)
			expect(window.aliasSentinel).toBeUndefined()
		} finally {
			await window.happyDOM.close()
		}
	})
})
