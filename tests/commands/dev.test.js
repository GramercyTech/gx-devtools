/**
 * Tests for the dev command's NDJSON logger + service orchestration helpers.
 *
 * The full devCommand runs real Vite/Socket.IO processes — that path is
 * covered by the e2e suite. Here we cover the three pieces with isolated
 * inputs so regressions in JSON shape or stream handling show up fast.
 */
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest"
import { EventEmitter } from "events"

// dev.js destructures spawn from child_process at require-time, and Node's
// built-in module resolution bypasses vitest's mock loader. Rather than
// fight that, dev.js exposes a setSpawnForTesting() seam — we swap in a
// stub here for the duration of the suite and restore it in afterAll.
const dev = require("../../bin/lib/commands/dev")
const spawnMock = vi.fn()
dev.setSpawnForTesting(spawnMock)

afterAll(() => {
	dev.setSpawnForTesting(null)
})

/** Build a fake child process matching the bits spawnService touches. */
function makeFakeChild() {
	const child = new EventEmitter()
	child.stdout = new EventEmitter()
	child.stdout.setEncoding = vi.fn()
	child.stderr = new EventEmitter()
	child.stderr.setEncoding = vi.fn()
	child.kill = vi.fn()
	child.killed = false
	child.exitCode = null
	return child
}

describe("dev command — createLogger", () => {
	let stdoutWrite, stderrWrite

	beforeEach(() => {
		stdoutWrite = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true)
		stderrWrite = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("emits one-line NDJSON records with timestamp/service/level/message in JSON mode", () => {
		const logger = dev.createLogger(true)

		logger.info("hello world", "VITE")

		expect(stdoutWrite).toHaveBeenCalledTimes(1)
		const written = stdoutWrite.mock.calls[0][0]
		expect(written.endsWith("\n")).toBe(true)
		expect(written.split("\n").filter(Boolean).length).toBe(1)

		const record = JSON.parse(written)
		expect(record).toMatchObject({
			service: "VITE",
			level: "info",
			message: "hello world",
		})
		expect(typeof record.timestamp).toBe("string")
		expect(Number.isNaN(Date.parse(record.timestamp))).toBe(false)
	})

	it("routes warn and error through NDJSON stdout (not stderr) in JSON mode", () => {
		const logger = dev.createLogger(true)

		logger.warn("be careful", "SOCKET")
		logger.error("boom", "SOCKET")

		expect(stderrWrite).not.toHaveBeenCalled()
		expect(stdoutWrite).toHaveBeenCalledTimes(2)
		const levels = stdoutWrite.mock.calls.map((c) => JSON.parse(c[0]).level)
		expect(levels).toEqual(["warn", "error"])
	})

	it("defaults service to GXDEV when omitted", () => {
		const logger = dev.createLogger(true)

		logger.info("default service")

		const record = JSON.parse(stdoutWrite.mock.calls[0][0])
		expect(record.service).toBe("GXDEV")
	})

	it("routes warn/error to stderr and info to stdout in plain-text mode", () => {
		const logger = dev.createLogger(false)

		logger.info("informational")
		logger.warn("warning")
		logger.error("error")

		expect(stdoutWrite).toHaveBeenCalledTimes(1)
		expect(stdoutWrite.mock.calls[0][0]).toBe("informational\n")
		expect(stderrWrite).toHaveBeenCalledTimes(2)
		expect(stderrWrite.mock.calls[0][0]).toBe("warning\n")
		expect(stderrWrite.mock.calls[1][0]).toBe("error\n")
	})

	it("exposes the jsonMode flag so callers can branch on it", () => {
		expect(dev.createLogger(true).jsonMode).toBe(true)
		expect(dev.createLogger(false).jsonMode).toBe(false)
	})
})

describe("dev command — spawnService", () => {
	beforeEach(() => {
		spawnMock.mockReset()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("buffers stdout into one logger call per line, stripping ANSI", () => {
		const fake = makeFakeChild()
		spawnMock.mockReturnValue(fake)

		const logger = {
			jsonMode: true,
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		dev.spawnService("VITE", "echo hi", logger)

		// Emit a chunk that splits across two lines, with ANSI color codes.
		fake.stdout.emit("data", "\x1b[32mready\x1b[0m\nlistening on :3060\n")

		expect(logger.info).toHaveBeenCalledTimes(2)
		expect(logger.info).toHaveBeenNthCalledWith(1, "ready", "VITE")
		expect(logger.info).toHaveBeenNthCalledWith(2, "listening on :3060", "VITE")
	})

	it("holds back partial-line buffers until the next newline arrives", () => {
		const fake = makeFakeChild()
		spawnMock.mockReturnValue(fake)

		const logger = {
			jsonMode: true,
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		dev.spawnService("VITE", "noop", logger)

		fake.stdout.emit("data", "partial")
		expect(logger.info).not.toHaveBeenCalled()

		fake.stdout.emit("data", " line\nnext\n")
		expect(logger.info).toHaveBeenCalledTimes(2)
		expect(logger.info).toHaveBeenNthCalledWith(1, "partial line", "VITE")
		expect(logger.info).toHaveBeenNthCalledWith(2, "next", "VITE")
	})

	it("flushes any trailing buffered text on stream end", () => {
		const fake = makeFakeChild()
		spawnMock.mockReturnValue(fake)

		const logger = {
			jsonMode: true,
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		dev.spawnService("VITE", "noop", logger)

		fake.stdout.emit("data", "trailing without newline")
		fake.stdout.emit("end")

		expect(logger.info).toHaveBeenCalledWith("trailing without newline", "VITE")
	})

	it("pipes stderr through logger.error", () => {
		const fake = makeFakeChild()
		spawnMock.mockReturnValue(fake)

		const logger = {
			jsonMode: true,
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		dev.spawnService("SOCKET", "noop", logger)
		fake.stderr.emit("data", "EADDRINUSE\n")

		expect(logger.error).toHaveBeenCalledWith("EADDRINUSE", "SOCKET")
		expect(logger.info).not.toHaveBeenCalled()
	})

	it("spawns the command via shell with stdout/stderr piped", () => {
		spawnMock.mockReturnValue(makeFakeChild())
		const logger = {
			jsonMode: true,
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		dev.spawnService("VITE", "npx vite", logger)

		expect(spawnMock).toHaveBeenCalledTimes(1)
		const [cmd, opts] = spawnMock.mock.calls[0]
		expect(cmd).toBe("npx vite")
		expect(opts.shell).toBe(true)
		expect(opts.stdio).toEqual(["ignore", "pipe", "pipe"])
	})
})

describe("dev command — shouldDisableSocket (--no-socket flag parsing)", () => {
	it("returns true when yargs delivers the negated form (argv.socket === false)", () => {
		// When the user types `--no-socket`, yargs sets argv.socket = false.
		// argv["no-socket"] is not set in that case.
		expect(dev.shouldDisableSocket({ socket: false })).toBe(true)
	})

	it("returns true when the literal --no-socket form arrives as argv['no-socket']", () => {
		// Some callers (e.g. the TUI string-arg path) pass the flag through
		// without yargs negation. Accept that spelling too.
		expect(dev.shouldDisableSocket({ "no-socket": true })).toBe(true)
	})

	it("returns false when neither flag is set", () => {
		expect(dev.shouldDisableSocket({})).toBe(false)
	})

	it("returns false when --socket is explicitly true", () => {
		expect(dev.shouldDisableSocket({ socket: true })).toBe(false)
	})

	it("returns false when --no-socket has the falsy default", () => {
		expect(dev.shouldDisableSocket({ "no-socket": false })).toBe(false)
	})
})

describe("dev command — runServicesJson", () => {
	let exitSpy

	beforeEach(() => {
		spawnMock.mockReset()
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
		// runServicesJson registers SIGINT/SIGTERM listeners. Detach them
		// so they don't leak across tests.
		process.removeAllListeners("SIGINT")
		process.removeAllListeners("SIGTERM")
	})

	it("starts each service and emits a 'starting' log line per service", () => {
		spawnMock.mockImplementation(() => makeFakeChild())
		const logger = {
			jsonMode: true,
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		dev.runServicesJson(
			[
				{ name: "VITE", command: "npx vite" },
				{ name: "SOCKET", command: "npx nodemon server.cjs" },
			],
			logger,
		)

		expect(spawnMock).toHaveBeenCalledTimes(2)
		const startingLines = logger.info.mock.calls.filter((c) =>
			c[0].startsWith("starting "),
		)
		expect(startingLines).toHaveLength(2)
	})

	it("calls process.exit with the first child's exit code and SIGTERMs the others", () => {
		const viteChild = makeFakeChild()
		const socketChild = makeFakeChild()
		spawnMock.mockReturnValueOnce(viteChild).mockReturnValueOnce(socketChild)

		const logger = {
			jsonMode: true,
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		dev.runServicesJson(
			[
				{ name: "VITE", command: "npx vite" },
				{ name: "SOCKET", command: "npx nodemon" },
			],
			logger,
		)

		// VITE crashes with code 2 — shutdown should propagate and kill the rest.
		viteChild.emit("exit", 2, null)

		expect(socketChild.kill).toHaveBeenCalledWith("SIGTERM")
		expect(exitSpy).toHaveBeenCalledWith(2)
	})

	it("treats spawn errors as a fatal shutdown with exit code 1", () => {
		const child = makeFakeChild()
		spawnMock.mockReturnValue(child)
		const logger = {
			jsonMode: true,
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		}

		dev.runServicesJson([{ name: "VITE", command: "bogus" }], logger)

		child.emit("error", new Error("ENOENT"))

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining("ENOENT"),
			"VITE",
		)
		expect(exitSpy).toHaveBeenCalledWith(1)
	})
})
