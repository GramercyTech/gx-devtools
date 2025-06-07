const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
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

// Check for SSL certificates
const certsDir = path.join(process.cwd(), ".certs");
const certPath = path.join(certsDir, "localhost.pem");
const keyPath = path.join(certsDir, "localhost-key.pem");

let server;
let protocol = "HTTP";

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
	// Use HTTPS if certificates are available
	const https = require("https");
	const options = {
		cert: fs.readFileSync(certPath),
		key: fs.readFileSync(keyPath),
	};
	server = https.createServer(options, app);
	protocol = "HTTPS";
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

server.listen(3069, () => {
	console.log(`🔗 Socket.IO server running on ${protocol} at port 3069`);
	if (protocol === "HTTPS") {
		console.log("🔒 Using SSL certificates for secure WebSocket connections");
	}
	console.log("📡 Socket event simulation available at POST /emit");
});
