const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load .env file from project directory (process.cwd())
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
	dotenv.config({ path: envPath });
}

const app = express();

app.use(
	cors({
		origin: "*",
	})
);

// Middleware to parse JSON
app.use(express.json());

// Serve static development assets
const devAssetsDir = path.join(process.cwd(), "dev-assets");
if (fs.existsSync(devAssetsDir)) {
	app.use("/dev-assets", express.static(devAssetsDir));
	console.log("📁 Serving development assets from /dev-assets");
}

/**
 * Finds existing SSL certificates in the certs directory, including those with suffixes
 */
function findExistingCertificates(certsDir) {
	if (!fs.existsSync(certsDir)) {
		return null;
	}

	const files = fs.readdirSync(certsDir);

	// Look for localhost certificates (with or without suffixes)
	const certFile = files.find(
		(f) =>
			f.startsWith("localhost") && f.endsWith(".pem") && !f.includes("-key")
	);
	const keyFile = files.find(
		(f) => f.startsWith("localhost") && f.endsWith("-key.pem")
	);

	if (certFile && keyFile) {
		const certPath = path.join(certsDir, certFile);
		const keyPath = path.join(certsDir, keyFile);

		// Verify files actually exist and have content
		try {
			const certStats = fs.statSync(certPath);
			const keyStats = fs.statSync(keyPath);

			if (certStats.size > 0 && keyStats.size > 0) {
				return { certPath, keyPath };
			}
		} catch (error) {
			// Files don't exist or can't be read
		}
	}

	return null;
}

// Check for SSL certificates using improved detection
const certsDir = path.join(process.cwd(), ".certs");
const existingCerts = findExistingCertificates(certsDir);

let server;
let protocol = "HTTP";

if (existingCerts) {
	// Use HTTPS if certificates are available
	const https = require("https");
	const options = {
		cert: fs.readFileSync(existingCerts.certPath),
		key: fs.readFileSync(existingCerts.keyPath),
	};
	server = https.createServer(options, app);
	protocol = "HTTPS";
	console.log(`📁 Using certificate: ${path.basename(existingCerts.certPath)}`);
	console.log(`🔑 Using key: ${path.basename(existingCerts.keyPath)}`);
} else {
	// Fall back to HTTP if no certificates
	const http = require("http");
	server = http.createServer(app);
}

const { Server } = require("socket.io");

const io = new Server(server, {
	cors: {
		origin: "*",
	},
});

io.on("connection", (socket) => {
	socket.onAny((event, data) => {
		socket.broadcast.emit(event, data);
	});
});

// HTTP endpoint for CLI to send socket events
app.post("/emit", (req, res) => {
	const { event, channel, data } = req.body;

	if (!event) {
		return res.status(400).json({ error: "Event name is required" });
	}

	console.log(`📡 CLI triggered socket event: ${event}`);
	console.log(`📺 Channel: ${channel}`);
	console.log(`📦 Data:`, data);

	// Emit to all connected clients
	io.emit(event, data);

	res.json({
		success: true,
		message: `Event ${event} sent to all connected clients`,
		event,
		channel,
		data,
	});
});

// Basic health check endpoint
app.get("/health", (req, res) => {
	res.json({
		status: "ok",
		protocol,
		timestamp: new Date().toISOString(),
	});
});

let socketIoPort = process.env.SOCKET_IO_PORT || 3069;

server.listen(socketIoPort, () => {
	console.log(
		`🔗 Socket.IO server running on ${protocol} at port ${socketIoPort}`
	);
	if (protocol === "HTTPS") {
		console.log("🔒 Using SSL certificates for secure WebSocket connections");
	}
	console.log("📡 Socket event simulation available at POST /emit");
});
