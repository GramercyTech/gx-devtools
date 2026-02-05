/**
 * SSL Command
 *
 * Sets up SSL certificates for HTTPS development.
 */

const {
	findProjectRoot,
	ensureMkcertInstalled,
	generateSSLCertificates,
	updateEnvWithCertPaths,
} = require("../utils");

/**
 * Setup SSL certificates command
 */
function setupSSLCommand() {
	const projectPath = findProjectRoot();

	console.log("Setting up SSL certificates for HTTPS development...");

	// Ensure mkcert is available
	ensureMkcertInstalled();

	// Generate certificates
	const certs = generateSSLCertificates(projectPath);

	if (certs) {
		// Update .env file with actual certificate names
		updateEnvWithCertPaths(projectPath, certs);

		console.log("✅ SSL setup complete!");
		console.log("🔒 Your development server will now use HTTPS");
		console.log("📁 Certificates stored in .certs/ directory");
		console.log(
			"🚀 Run 'pnpm run dev' to start HTTPS development with Socket.IO"
		);
	} else {
		console.log(
			"❌ SSL setup failed. You can still use HTTP with 'pnpm run dev-http'"
		);
	}
}

module.exports = {
	setupSSLCommand,
};
