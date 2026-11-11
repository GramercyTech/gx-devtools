/**
 * Socket Command
 *
 * Simulates socket events for development testing.
 */

const path = require("path")
const fs = require("fs")
const { spawnSync } = require("child_process")
const { findProjectRoot, resolveGxPaths } = require("../utils")

const CERT_ERROR_CODES = new Set([
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
	"UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
	"SELF_SIGNED_CERT_IN_CHAIN",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
	"CERT_HAS_EXPIRED",
	"ERR_TLS_CERT_ALTNAME_INVALID",
])

/**
 * Mirrors runtime/server.cjs: the Socket.IO server uses HTTPS only when
 * `.certs/` holds a localhost certificate and key pair, otherwise plain HTTP.
 * @param {string} projectPath
 * @returns {boolean}
 */
function socketServerUsesHttps(projectPath) {
	const certsDir = path.join(projectPath, ".certs")
	if (!fs.existsSync(certsDir)) {
		return false
	}
	const files = fs.readdirSync(certsDir)
	const hasCert = files.some(
		(f) =>
			f.startsWith("localhost") && f.endsWith(".pem") && !f.includes("-key"),
	)
	const hasKey = files.some(
		(f) => f.startsWith("localhost") && f.endsWith("-key.pem"),
	)
	return hasCert && hasKey
}

/**
 * Locate mkcert's root CA so Node trusts the dev server certificate without
 * disabling verification or requiring NODE_OPTIONS=--use-system-ca.
 * @param {typeof spawnSync} run
 * @returns {string|null}
 */
function mkcertRootCaPath(run = spawnSync) {
	try {
		const result = run("mkcert", ["-CAROOT"], { encoding: "utf8" })
		if (result.status !== 0 || !result.stdout) {
			return null
		}
		const caPath = path.join(result.stdout.trim(), "rootCA.pem")
		return fs.existsSync(caPath) ? caPath : null
	} catch (_e) {
		return null
	}
}

/**
 * Base URL and HTTPS agent for posting to the local Socket.IO server.
 * @param {string} projectPath
 * @param {number|string} port
 * @param {{ caPath?: string|null }} [options]
 * @returns {{ url: string, httpsAgent?: import("https").Agent }}
 */
function socketRequestTarget(projectPath, port, options = {}) {
	if (!socketServerUsesHttps(projectPath)) {
		return { url: `http://localhost:${port}` }
	}
	const caPath =
		options.caPath !== undefined ? options.caPath : mkcertRootCaPath()
	if (!caPath) {
		return { url: `https://localhost:${port}` }
	}
	const https = require("https")
	const tls = require("tls")
	return {
		url: `https://localhost:${port}`,
		httpsAgent: new https.Agent({
			ca: [...tls.rootCertificates, fs.readFileSync(caPath, "utf8")],
		}),
	}
}

/**
 * Socket simulation command - sends JSON events to the Socket.IO server
 */
async function socketCommand(argv) {
	const action = argv.action

	if (action === "list") {
		listSocketEvents()
	} else if (action === "send") {
		await sendSocketEvent(argv.event, argv.identifier)
	} else {
		console.error("❌ Invalid socket action. Use 'list' or 'send'")
		process.exit(1)
	}
}

function listSocketEvents() {
	const projectPath = findProjectRoot()
	const paths = resolveGxPaths()

	// Check local project socket-events first, then fall back to toolkit's socket-events
	let eventsDir = path.join(projectPath, "socket-events")
	if (!fs.existsSync(eventsDir)) {
		eventsDir = paths.socketEventsDir
	}

	if (!fs.existsSync(eventsDir)) {
		console.log("❌ No socket events directory found")
		console.log(`📁 Looking in: ${eventsDir}`)
		return
	}

	const eventFiles = fs
		.readdirSync(eventsDir)
		.filter((file) => file.endsWith(".json"))

	if (eventFiles.length === 0) {
		console.log("❌ No socket event files found")
		return
	}

	console.log("📡 Available socket events:")
	console.log("")

	eventFiles.forEach((file) => {
		const eventPath = path.join(eventsDir, file)
		try {
			const eventData = JSON.parse(fs.readFileSync(eventPath, "utf-8"))
			const eventName = path.basename(file, ".json")
			console.log(`🎯 ${eventName}`)
			console.log(`   Event: ${eventData.event}`)
			console.log(`   Channel: ${eventData.channel}`)
			if (eventData.data.id) {
				console.log(`   Data ID: ${eventData.data.id}`)
			}
			console.log("")
		} catch (error) {
			console.error(`❌ Error reading ${file}: ${error.message}`)
		}
	})

	console.log("💡 Usage:")
	console.log("   gxdev socket send --event AiSessionMessageCreated")
	console.log(
		"   gxdev socket send --event SocialStreamPostCreated --identifier social_stream",
	)
}

async function sendSocketEvent(eventName, identifier) {
	if (!eventName) {
		console.error("❌ Event name is required")
		console.log("💡 Use: gxdev socket send --event <EventName>")
		process.exit(1)
	}

	const projectPath = findProjectRoot()
	const paths = resolveGxPaths()
	const socketIoPort = process.env.SOCKET_IO_PORT || 3069

	// Check local project socket-events first, then fall back to toolkit's socket-events
	let eventsDir = path.join(projectPath, "socket-events")
	if (!fs.existsSync(eventsDir)) {
		eventsDir = paths.socketEventsDir
	}

	const eventPath = path.join(eventsDir, `${eventName}.json`)

	if (!fs.existsSync(eventPath)) {
		console.error(`❌ Event file not found: ${eventName}.json`)
		console.log(`📁 Looking in: ${eventsDir}`)
		console.log("💡 Use 'gxdev socket list' to see available events")
		process.exit(1)
	}

	try {
		let eventData = JSON.parse(fs.readFileSync(eventPath, "utf-8"))

		// If identifier is provided, update the channel
		if (identifier) {
			// Try to extract model from the original channel
			const channelParts = eventData.channel.split(".")
			if (channelParts.length >= 2) {
				const model = channelParts[1]
				eventData.channel = `private.${model}.${identifier}`
			}
		}

		const { url: socketUrl, httpsAgent } = socketRequestTarget(
			projectPath,
			socketIoPort,
		)

		console.log(`📡 Sending socket event: ${eventData.event}`)
		console.log(`📺 Channel: ${eventData.channel}`)
		console.log(`📦 Data:`, JSON.stringify(eventData.data, null, 2))

		// Use axios to send the event to our Socket.IO server
		const axios = require("axios")

		try {
			await axios.post(
				`${socketUrl}/emit`,
				{
					event: eventData.event,
					channel: eventData.channel,
					data: eventData.data,
				},
				httpsAgent ? { httpsAgent } : {},
			)

			console.log("✅ Socket event sent successfully!")
			console.log(
				"👂 Check your app console for the received event in the store",
			)
		} catch (error) {
			if (error.code === "ECONNREFUSED") {
				console.error("❌ Cannot connect to Socket.IO server")
				console.log("💡 Make sure the server is running:")
				console.log("   npm run dev")
				console.log("   or")
				console.log("   node --watch server.js")
			} else if (CERT_ERROR_CODES.has(error.code)) {
				console.error(
					`❌ The dev server's HTTPS certificate isn't trusted (${error.code})`,
				)
				console.log("💡 Install the mkcert root CA and retry:")
				console.log("   mkcert -install")
				console.log(
					'   or: NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" gxdev socket send ...',
				)
			} else {
				console.error(`❌ Error sending event: ${error.message}`)
			}
		}
	} catch (error) {
		console.error(`❌ Error reading event file: ${error.message}`)
		process.exit(1)
	}
}

module.exports = {
	socketCommand,
	socketServerUsesHttps,
	mkcertRootCaPath,
	socketRequestTarget,
}
