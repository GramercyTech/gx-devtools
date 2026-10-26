import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import vm from "node:vm"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const helper = fs.readFileSync(
	new URL("../e2e/candidate-install.cjs", import.meta.url),
	"utf8",
)
const folders = []
afterEach(() => {
	for (const folder of folders.splice(0))
		fs.rmSync(folder, { recursive: true, force: true })
})
function fixture(change = () => {}) {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-candidate-unit-"))
	folders.push(folder)
	const project = path.join(folder, "project")
	fs.mkdirSync(project)
	const manifest = {
		dependencies: { "@gxp-dev/app-ui": "^0.2.0" },
		devDependencies: { "@gxp-dev/tools": "^2.1.44" },
	}
	const archive = path.join(folder, "candidate.tgz")
	fs.writeFileSync(archive, "synthetic archive")
	const config = {
		project,
		receipt: path.join(folder, "receipt.json"),
		archives: {
			"@gxp-dev/tools": {
				path: archive,
				sha256: crypto
					.createHash("sha256")
					.update(fs.readFileSync(archive))
					.digest("hex"),
			},
		},
	}
	change({ manifest, config })
	fs.writeFileSync(path.join(project, "package.json"), JSON.stringify(manifest))
	const configPath = path.join(folder, "config.json")
	fs.writeFileSync(configPath, JSON.stringify(config))
	const calls = []
	const commands = {
		npm: (...args) => {
			calls.push(args)
			return { code: 0 }
		},
	}
	vm.runInNewContext(helper, {
		module: {
			require: (name) =>
				name === "../../bin/lib/utils/process" ? commands : require(name),
		},
		process: { env: { GXDEV_E2E_INSTALL_CONFIG: configPath } },
	})
	return { project, commands, calls, config, manifest }
}
describe("test-only packed scaffold substitution", () => {
	it("checks public floors before substituting one exact archive and delegates actual npm commands", () => {
		const f = fixture()
		expect(f.commands.npm(["install"], { cwd: f.project })).toEqual({ code: 0 })
		expect(f.commands.npm(["ci", "--dry-run"], { cwd: f.project })).toEqual({
			code: 0,
		})
		expect(f.calls).toEqual([
			[["install"], { cwd: f.project }],
			[["ci", "--dry-run"], { cwd: f.project }],
		])
		const pkg = JSON.parse(
			fs.readFileSync(path.join(f.project, "package.json")),
		)
		expect(pkg.dependencies["@gxp-dev/app-ui"]).toBe("^0.2.0")
		expect(pkg.devDependencies["@gxp-dev/tools"]).toBe(
			`file:${f.config.archives["@gxp-dev/tools"].path}`,
		)
		expect(JSON.parse(fs.readFileSync(f.config.receipt))).toEqual({
			requested: { appui: "^0.2.0", toolkit: "^2.1.44" },
			substituted: ["@gxp-dev/tools"],
			realNpmInstall: true,
			archiveSha256: {
				"@gxp-dev/tools": f.config.archives["@gxp-dev/tools"].sha256,
			},
		})
	})
	it.each(["floor", "digest", "directory"])(
		"rejects %s drift before npm or manifest mutation",
		(mode) => {
			const f = fixture(({ manifest, config }) => {
				if (mode === "floor")
					manifest.devDependencies["@gxp-dev/tools"] = "^2.1.0"
				if (mode === "digest")
					config.archives["@gxp-dev/tools"].sha256 = "0".repeat(64)
			})
			const file = path.join(f.project, "package.json")
			const before = fs.readFileSync(file)
			expect(() =>
				f.commands.npm(["install"], {
					cwd: mode === "directory" ? path.dirname(f.project) : f.project,
				}),
			).toThrow()
			expect(fs.readFileSync(file)).toEqual(before)
			expect(f.calls).toHaveLength(0)
			expect(fs.existsSync(f.config.receipt)).toBe(false)
		},
	)
})
