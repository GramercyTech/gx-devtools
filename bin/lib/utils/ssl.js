/**
 * SSL Certificate Management
 *
 * Handles SSL certificate generation and management using mkcert.
 */

const path = require("path");
const fs = require("fs");
const shell = require("shelljs");

/**
 * Checks if mkcert is installed globally
 */
function isMkcertInstalled() {
	return shell.which("mkcert") !== null;
}

/**
 * Installs mkcert globally if not already installed
 */
function ensureMkcertInstalled() {
	if (isMkcertInstalled()) {
		console.log("✓ mkcert is already installed globally");
		return true;
	}

	console.log("Installing mkcert globally...");
	const result = shell.exec("npm install -g mkcert", { silent: true });

	if (result.code === 0) {
		console.log("✓ mkcert installed successfully");
		return true;
	} else {
		console.warn("⚠ Could not install mkcert globally, will use local version");
		return false;
	}
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

/**
 * Cleans up old SSL certificate files to prevent naming conflicts
 */
function cleanupOldCertificates(certsDir) {
	if (!fs.existsSync(certsDir)) {
		return;
	}

	try {
		const files = fs.readdirSync(certsDir);
		const certFiles = files.filter(
			(f) =>
				f.startsWith("localhost") &&
				(f.endsWith(".pem") || f.endsWith("-key.pem"))
		);

		if (certFiles.length > 0) {
			console.log("🧹 Cleaning up old certificate files...");
			certFiles.forEach((file) => {
				const filePath = path.join(certsDir, file);
				try {
					fs.unlinkSync(filePath);
					console.log(`   Removed: ${file}`);
				} catch (error) {
					console.warn(`   Could not remove ${file}: ${error.message}`);
				}
			});
		}
	} catch (error) {
		console.warn("⚠ Could not clean up old certificates:", error.message);
	}
}

/**
 * Generates SSL certificates for localhost using mkcert
 */
function generateSSLCertificates(projectPath) {
	const certsDir = path.join(projectPath, ".certs");

	// Create .certs directory
	if (!fs.existsSync(certsDir)) {
		fs.mkdirSync(certsDir, { recursive: true });
	}

	// Check for existing certificates (including those with suffixes like +2)
	const existingCerts = findExistingCertificates(certsDir);
	if (existingCerts) {
		console.log("✓ SSL certificates already exist");
		return existingCerts;
	}

	console.log("Generating SSL certificates for localhost...");

	// Clean up any leftover certificate files to avoid naming conflicts
	cleanupOldCertificates(certsDir);

	// Try global mkcert first
	let mkcertCmd = "mkcert";
	if (!isMkcertInstalled()) {
		// Use local mkcert via npx
		mkcertCmd = "npx mkcert";
	}

	// Change to certs directory and generate certificates
	const currentDir = process.cwd();
	try {
		process.chdir(certsDir);

		// Install CA if needed (only for global mkcert)
		if (isMkcertInstalled()) {
			shell.exec(`${mkcertCmd} -install`, { silent: true });
		}

		// Generate certificates for localhost
		const result = shell.exec(`${mkcertCmd} localhost 127.0.0.1 ::1`, {
			silent: true,
		});

		if (result.code === 0) {
			// Find the actual generated certificate files
			const generatedCerts = findExistingCertificates(certsDir);
			if (generatedCerts) {
				console.log("✓ SSL certificates generated successfully");
				console.log(
					`📁 Certificate: ${path.basename(generatedCerts.certPath)}`
				);
				console.log(`🔑 Key: ${path.basename(generatedCerts.keyPath)}`);
				return generatedCerts;
			} else {
				console.warn(
					"⚠ Certificates generated but not found in expected location"
				);
				return null;
			}
		} else {
			console.warn(
				"⚠ Failed to generate SSL certificates, falling back to HTTP"
			);
			return null;
		}
	} catch (error) {
		console.warn("⚠ Error generating SSL certificates:", error.message);
		return null;
	} finally {
		process.chdir(currentDir);
	}
}

/**
 * Updates the .env file with the actual SSL certificate paths
 */
function updateEnvWithCertPaths(projectPath, certs) {
	const envPath = path.join(projectPath, ".env");

	if (!fs.existsSync(envPath)) {
		console.warn("⚠ .env file not found, skipping certificate path update");
		return;
	}

	try {
		let envContent = fs.readFileSync(envPath, "utf-8");

		// Get just the filenames from the full paths
		const certFileName = path.basename(certs.certPath);
		const keyFileName = path.basename(certs.keyPath);

		// Update CERT_PATH and KEY_PATH with actual filenames
		envContent = envContent.replace(
			/CERT_PATH=.*$/m,
			`CERT_PATH=.certs/${certFileName}`
		);
		envContent = envContent.replace(
			/KEY_PATH=.*$/m,
			`KEY_PATH=.certs/${keyFileName}`
		);

		fs.writeFileSync(envPath, envContent);
		console.log("✓ Updated .env with SSL certificate paths");
		console.log(`   CERT_PATH=.certs/${certFileName}`);
		console.log(`   KEY_PATH=.certs/${keyFileName}`);
	} catch (error) {
		console.warn(
			"⚠ Could not update .env with certificate paths:",
			error.message
		);
	}
}

module.exports = {
	isMkcertInstalled,
	ensureMkcertInstalled,
	findExistingCertificates,
	cleanupOldCertificates,
	generateSSLCertificates,
	updateEnvWithCertPaths,
};
