import { describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const load = createRequire(import.meta.url)
const toolkit = load("../../package.json")
const { REQUIRED_DEPENDENCIES } = load("../../bin/lib/constants")
const enabled = process.env.RUN_PACKED_CLI_E2E === "1"

// This separate opt-in exercises the distributed package, with no checkout/global
// resolution and a real enabled initial-commit hook after --local --yes rewrites.
describe.runIf(enabled)("packed legacy bootstrap", () => {
	it("installs and scaffolds all flat-config imports before the initial commit", () => {
		const tarball = process.env.GXDEV_PACKED_TARBALL
		expect(tarball).toBeTruthy()
		expect(fs.lstatSync(tarball).isFile()).toBe(true)
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "gxdev-packed-legacy-"))
		const project = path.join(root, "project")
		const home = path.join(root, "home")
		fs.mkdirSync(project)
		fs.mkdirSync(home)
		for (const name of ["user.npmrc", "global.npmrc"])
			fs.writeFileSync(path.join(root, name), "", { mode: 0o600 })
		const env = {
			PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
			HOME: home,
			NPM_CONFIG_USERCONFIG: path.join(root, "user.npmrc"),
			NPM_CONFIG_GLOBALCONFIG: path.join(root, "global.npmrc"),
			NPM_CONFIG_CACHE: path.join(root, "cache"),
			NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
			NPM_CONFIG_AUDIT: "false",
			NPM_CONFIG_FUND: "false",
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_CONFIG_GLOBAL: os.devNull,
			GIT_AUTHOR_NAME: "Toolkit fixture",
			GIT_AUTHOR_EMAIL: "fixture@example.invalid",
			GIT_COMMITTER_NAME: "Toolkit fixture",
			GIT_COMMITTER_EMAIL: "fixture@example.invalid",
		}
		const run = (command, args) => {
			const result = spawnSync(command, args, {
				cwd: project,
				env,
				encoding: "utf8",
				timeout: 300000,
				maxBuffer: 4194304,
			})
			expect(result.error).toBeUndefined()
			expect(result.status, result.stdout + result.stderr).toBe(0)
			return result.stdout
		}
		try {
			for (let parent = root; ; parent = path.dirname(parent)) {
				expect(fs.existsSync(path.join(parent, "node_modules"))).toBe(false)
				if (parent === path.dirname(parent)) break
			}
			run("git", ["init", "--quiet"])
			run("npm", ["init", "--yes"])
			run("npm", ["install", path.resolve(tarball)])
			run("npx", [
				"--no-install",
				"gxdev",
				"init",
				"packed-legacy-fixture",
				"--yes",
				"--local",
			])
			const pkg = JSON.parse(
				fs.readFileSync(path.join(project, "package.json"), "utf8"),
			)
			const installed = JSON.parse(
				fs.readFileSync(
					path.join(project, "node_modules/@gxp-dev/tools/package.json"),
					"utf8",
				),
			)
			expect(installed.version).toBe(toolkit.version)
			expect(installed.dependencies["@eslint/js"]).toBe(
				toolkit.dependencies["@eslint/js"],
			)
			expect(pkg.devDependencies["@eslint/js"]).toBe(
				toolkit.dependencies["@eslint/js"],
			)
			expect(pkg.dependencies["@gxp-dev/app-ui"]).toBe(
				REQUIRED_DEPENDENCIES["@gxp-dev/app-ui"],
			)
			expect(run("git", ["config", "--get", "core.hooksPath"]).trim()).toBe(
				".githooks",
			)
			run("git", ["add", "."])
			run("git", ["commit", "-m", "Verify distributed scaffold hook"])
			expect(run("git", ["rev-list", "--count", "HEAD"]).trim()).toBe("1")
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	}, 600000)
})
