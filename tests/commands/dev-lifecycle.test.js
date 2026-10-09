import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
const require = createRequire(import.meta.url)
const modulePath = require.resolve("../../bin/lib/commands/dev.js")
let root, runner
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "gxp watch ; spaces "))
})
afterEach(() => {
	if (runner && runner.exitCode === null) runner.kill("SIGKILL")
	fs.rmSync(root, { recursive: true, force: true })
})
function start(services) {
	const child = spawn(
		process.execPath,
		[
			"-e",
			"const d=require(process.argv[1]); d.runServicesJson(JSON.parse(process.argv[2]),d.createLogger(true))",
			modulePath,
			JSON.stringify(services),
		],
		{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
	)
	runner = child
	let output = ""
	child.stdout.on("data", (data) => {
		output += data.toString()
	})
	child.stderr.on("data", (data) => {
		output += data.toString()
	})
	const done = new Promise((resolve) =>
		child.once("close", (code, signal) => resolve({ code, signal })),
	)
	return { child, done, output: () => output }
}
async function waitFor(check) {
	const deadline = Date.now() + 10000
	while (!check()) {
		if (Date.now() > deadline) throw new Error("Lifecycle condition timed out")
		await new Promise((resolve) => setTimeout(resolve, 25))
	}
}
function alive(pid) {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}
describe("real dev process lifecycle", () => {
	it("restarts Node watch after edits and stops the watched child on SIGTERM", async () => {
		const script = path.join(root, "server ; fixture.cjs")
		const source = (version) =>
			`console.log('READY-${version}-'+process.pid); setInterval(()=>{},1000)`
		fs.writeFileSync(script, source(1))
		const service = start([
			{
				name: "SOCKET",
				command: process.execPath,
				args: ["--watch", "--watch-preserve-output", script],
			},
		])
		await waitFor(() => service.output().includes("READY-1-"))
		const firstPid = Number(service.output().match(/READY-1-(\d+)/)[1])
		fs.writeFileSync(script, source(2))
		await waitFor(() => service.output().includes("READY-2-"))
		const secondPid = Number(service.output().match(/READY-2-(\d+)/)[1])
		expect(secondPid).not.toBe(firstPid)
		service.child.kill("SIGTERM")
		expect(await service.done).toEqual({ code: 143, signal: null })
		await waitFor(() => !alive(firstPid) && !alive(secondPid))
	}, 15000)
	it("propagates failure and stops its sibling service", async () => {
		const service = start([
			{
				name: "LONG",
				command: process.execPath,
				args: [
					"-e",
					"console.log('PID-'+process.pid);setInterval(()=>{},1000)",
				],
			},
			{
				name: "FAIL",
				command: process.execPath,
				args: ["-e", "setTimeout(()=>process.exit(7),300)"],
			},
		])
		await waitFor(() => service.output().includes("PID-"))
		const pid = Number(service.output().match(/PID-(\d+)/)[1])
		expect(await service.done).toEqual({ code: 7, signal: null })
		await waitFor(() => !alive(pid))
	}, 15000)
})
