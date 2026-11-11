import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
	socketServerUsesHttps,
	mkcertRootCaPath,
	socketRequestTarget,
} = require("../../bin/lib/commands/socket.js")

const dirs = []
function project(files = []) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-socket-"))
	dirs.push(dir)
	if (files.length) {
		fs.mkdirSync(path.join(dir, ".certs"))
		for (const name of files) {
			fs.writeFileSync(path.join(dir, ".certs", name), "x")
		}
	}
	return dir
}

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true })
	}
})

describe("socket send target", () => {
	it("uses plain HTTP when the project has no localhost cert pair, like the server", () => {
		expect(socketServerUsesHttps(project())).toBe(false)
		expect(socketServerUsesHttps(project(["localhost.pem"]))).toBe(false)
		expect(socketRequestTarget(project(), 3069)).toEqual({
			url: "http://localhost:3069",
		})
	})

	it("uses HTTPS when .certs holds a localhost cert and key", () => {
		const dir = project(["localhost+2.pem", "localhost+2-key.pem"])
		expect(socketServerUsesHttps(dir)).toBe(true)
		expect(socketRequestTarget(dir, 3069, { caPath: null })).toEqual({
			url: "https://localhost:3069",
		})
	})

	it("trusts the mkcert root CA explicitly instead of disabling verification", () => {
		const dir = project(["localhost.pem", "localhost-key.pem"])
		const caPath = path.join(dir, "rootCA.pem")
		fs.writeFileSync(
			caPath,
			"-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n",
		)
		const { url, httpsAgent } = socketRequestTarget(dir, 3069, { caPath })
		expect(url).toBe("https://localhost:3069")
		expect(httpsAgent.options.rejectUnauthorized).not.toBe(false)
		expect(httpsAgent.options.ca).toContain(fs.readFileSync(caPath, "utf8"))
		expect(httpsAgent.options.ca.length).toBeGreaterThan(1)
	})

	it("finds rootCA.pem under mkcert -CAROOT and tolerates mkcert being absent", () => {
		const caroot = project()
		fs.writeFileSync(path.join(caroot, "rootCA.pem"), "ca")
		expect(mkcertRootCaPath(() => ({ status: 0, stdout: `${caroot}\n` }))).toBe(
			path.join(caroot, "rootCA.pem"),
		)
		expect(mkcertRootCaPath(() => ({ status: 1, stdout: "" }))).toBeNull()
		expect(
			mkcertRootCaPath(() => {
				throw new Error("ENOENT")
			}),
		).toBeNull()
	})
})
