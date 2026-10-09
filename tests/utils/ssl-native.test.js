import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const require = createRequire(import.meta.url)
const ssl = require("../../bin/lib/utils/ssl.js")
let root, previousPath
function nativeMkcert(body) {
	fs.writeFileSync(
		path.join(root, "mkcert"),
		`#!${process.execPath}\n${body}`,
		{ mode: 0o755 },
	)
}
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "gxp ssl ; spaces "))
	previousPath = process.env.PATH
	process.env.PATH = root
	vi.spyOn(console, "warn").mockImplementation(() => {})
	vi.spyOn(console, "log").mockImplementation(() => {})
})
afterEach(() => {
	process.env.PATH = previousPath
	fs.rmSync(root, { recursive: true, force: true })
	vi.restoreAllMocks()
})
describe("native certificate setup", () => {
	it("reports missing native mkcert without installing anything", () => {
		expect(ssl.ensureMkcertInstalled()).toBe(false)
		expect(ssl.generateSSLCertificates(root)).toBeNull()
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining("brew install mkcert"),
		)
		expect(fs.readdirSync(root)).toEqual([".certs"])
	})
	it("reuses existing certificates without requiring mkcert", () => {
		fs.mkdirSync(path.join(root, ".certs"))
		for (const name of ["localhost+2.pem", "localhost+2-key.pem"])
			fs.writeFileSync(path.join(root, ".certs", name), "fixture")
		expect(ssl.generateSSLCertificates(root).certPath).toBe(
			path.join(root, ".certs", "localhost+2.pem"),
		)
		expect(console.warn).not.toHaveBeenCalled()
	})
	it("generates with separate arguments and preserves cwd for paths with shell characters", () => {
		nativeMkcert(`const fs = require('node:fs'); const args = process.argv.slice(2);
if (args[0] === '-version') console.log('v1.4.4');
else { fs.appendFileSync('calls.jsonl', JSON.stringify(args)+'\\n');
if (args[0] === 'localhost') { fs.writeFileSync('localhost.pem','cert'); fs.writeFileSync('localhost-key.pem','key'); } }`)
		const cwd = process.cwd()
		expect(ssl.generateSSLCertificates(root).keyPath).toBe(
			path.join(root, ".certs", "localhost-key.pem"),
		)
		expect(process.cwd()).toBe(cwd)
		expect(
			fs
				.readFileSync(path.join(root, ".certs", "calls.jsonl"), "utf8")
				.trim()
				.split("\n")
				.map(JSON.parse),
		).toEqual([["-install"], ["localhost", "127.0.0.1", "::1"]])
	})
	it("stops when trust installation fails", () => {
		nativeMkcert(
			"if(process.argv[2] === '-version') console.log('v1.4.4'); else process.exit(1)",
		)
		expect(ssl.generateSSLCertificates(root)).toBeNull()
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining("certificate authority"),
		)
	})
	it("rejects an unrelated executable's version output", () => {
		nativeMkcert("console.log('Usage: mkcert create-ca')")
		expect(ssl.ensureMkcertInstalled()).toBe(false)
	})
})
