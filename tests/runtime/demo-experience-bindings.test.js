import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, it, expect } from "vitest"

const source = readFileSync(
	new URL("../../template/src/DemoExperience.vue", import.meta.url),
	"utf8",
)

describe("Experience demo live binding guidance", () => {
	it("forwards the declared identifier and payload without hiding authorization errors", async () => {
		const snippet = source.match(/\/\/   (const callApi =[^\n]+)/)[1]
		const calls = []
		const callApi = runInNewContext(
			`${snippet}\ncallApi`,
			{
				gxpStore: {
					callApi: async (...args) => {
						calls.push(args)
						throw new Error("binding denied")
					},
				},
			},
			{ timeout: 1000 },
		)
		const payload = { synthetic: true }
		await expect(callApi("synthetic.read", payload)).rejects.toThrow(
			"binding denied",
		)
		expect(calls).toEqual([["synthetic.read", "experience_api", payload]])
		expect(source).toContain("actual manifest operation key")
		expect(source).toContain("missing/denied live bindings stay errors")
	})

	it("keeps the demo transport deliberately offline", () => {
		expect(source).toContain("const callApi = mockCallApi")
		expect(source).not.toContain('gxpStore.callApi(endpoint, "", payload)')
		expect(source).not.toContain("gxpStore.callApi(endpoint, '', payload)")
	})
})
