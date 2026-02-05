/**
 * Socket Command
 *
 * Simulates socket events for development testing.
 */

const path = require("path");
const fs = require("fs");
const { findProjectRoot, resolveGxPaths } = require("../utils");

/**
 * Socket simulation command - sends JSON events to the Socket.IO server
 */
async function socketCommand(argv) {
	const action = argv.action;

	if (action === "list") {
		listSocketEvents();
	} else if (action === "send") {
		await sendSocketEvent(argv.event, argv.identifier);
	} else {
		console.error("❌ Invalid socket action. Use 'list' or 'send'");
		process.exit(1);
	}
}

function listSocketEvents() {
	const projectPath = findProjectRoot();
	const paths = resolveGxPaths();

	// Check local project socket-events first, then fall back to toolkit's socket-events
	let eventsDir = path.join(projectPath, "socket-events");
	if (!fs.existsSync(eventsDir)) {
		eventsDir = paths.socketEventsDir;
	}

	if (!fs.existsSync(eventsDir)) {
		console.log("❌ No socket events directory found");
		console.log(`📁 Looking in: ${eventsDir}`);
		return;
	}

	const eventFiles = fs
		.readdirSync(eventsDir)
		.filter((file) => file.endsWith(".json"));

	if (eventFiles.length === 0) {
		console.log("❌ No socket event files found");
		return;
	}

	console.log("📡 Available socket events:");
	console.log("");

	eventFiles.forEach((file) => {
		const eventPath = path.join(eventsDir, file);
		try {
			const eventData = JSON.parse(fs.readFileSync(eventPath, "utf-8"));
			const eventName = path.basename(file, ".json");
			console.log(`🎯 ${eventName}`);
			console.log(`   Event: ${eventData.event}`);
			console.log(`   Channel: ${eventData.channel}`);
			if (eventData.data.id) {
				console.log(`   Data ID: ${eventData.data.id}`);
			}
			console.log("");
		} catch (error) {
			console.error(`❌ Error reading ${file}: ${error.message}`);
		}
	});

	console.log("💡 Usage:");
	console.log("   gxdev socket send --event AiSessionMessageCreated");
	console.log(
		"   gxdev socket send --event SocialStreamPostCreated --identifier social_stream"
	);
}

async function sendSocketEvent(eventName, identifier) {
	if (!eventName) {
		console.error("❌ Event name is required");
		console.log("💡 Use: gxdev socket send --event <EventName>");
		process.exit(1);
	}

	const projectPath = findProjectRoot();
	const paths = resolveGxPaths();
	const socketIoPort = process.env.SOCKET_IO_PORT || 3069;

	// Check local project socket-events first, then fall back to toolkit's socket-events
	let eventsDir = path.join(projectPath, "socket-events");
	if (!fs.existsSync(eventsDir)) {
		eventsDir = paths.socketEventsDir;
	}

	const eventPath = path.join(eventsDir, `${eventName}.json`);

	if (!fs.existsSync(eventPath)) {
		console.error(`❌ Event file not found: ${eventName}.json`);
		console.log(`📁 Looking in: ${eventsDir}`);
		console.log("💡 Use 'gxdev socket list' to see available events");
		process.exit(1);
	}

	try {
		let eventData = JSON.parse(fs.readFileSync(eventPath, "utf-8"));

		// If identifier is provided, update the channel
		if (identifier) {
			// Try to extract model from the original channel
			const channelParts = eventData.channel.split(".");
			if (channelParts.length >= 2) {
				const model = channelParts[1];
				eventData.channel = `private.${model}.${identifier}`;
			}
		}

		// Send the event via HTTP to the Socket.IO server
		const socketUrl = `https://localhost:${socketIoPort}`;

		console.log(`📡 Sending socket event: ${eventData.event}`);
		console.log(`📺 Channel: ${eventData.channel}`);
		console.log(`📦 Data:`, JSON.stringify(eventData.data, null, 2));

		// Use axios to send the event to our Socket.IO server
		const axios = require("axios");

		try {
			await axios.post(`${socketUrl}/emit`, {
				event: eventData.event,
				channel: eventData.channel,
				data: eventData.data,
			});

			console.log("✅ Socket event sent successfully!");
			console.log(
				"👂 Check your app console for the received event in the store"
			);
		} catch (error) {
			if (error.code === "ECONNREFUSED") {
				console.error("❌ Cannot connect to Socket.IO server");
				console.log("💡 Make sure the server is running:");
				console.log("   pnpm run dev");
				console.log("   or");
				console.log("   nodemon server.js");
			} else {
				console.error(`❌ Error sending event: ${error.message}`);
			}
		}
	} catch (error) {
		console.error(`❌ Error reading event file: ${error.message}`);
		process.exit(1);
	}
}

module.exports = {
	socketCommand,
};
