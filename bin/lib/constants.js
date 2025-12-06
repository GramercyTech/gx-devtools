/**
 * GxP Toolkit Constants
 *
 * Centralized configuration for dependencies, scripts, and platform settings.
 */

// Platform-specific configurations
const isWin = process.platform === "win32";
const exportCmd = isWin ? "set" : "export";

// Required dependencies for GxP projects
const REQUIRED_DEPENDENCIES = {
	"@vitejs/plugin-vue": "^5.1.4",
	vite: "^5.4.8",
	vue: "^3.5.8",
	pinia: "^2.1.7",
	axios: "^1.6.0",
	cors: "^2.8.5",
	express: "^4.21.0",
	"socket.io": "^4.8.0",
	"socket.io-client": "^4.8.0",
	dotenv: "^16.4.5",
	"@gramercytech/gx-componentkit": "^1.0.0",
};

const REQUIRED_DEV_DEPENDENCIES = {
	"@gramercytech/gx-toolkit": "^1.0.58",
	nodemon: "^3.1.7",
	concurrently: "^9.0.1",
	mkcert: "^3.2.0",
};

// Default scripts for package.json
const DEFAULT_SCRIPTS = {
	dev: "gxtk dev --with-socket",
	"dev-app": "gxtk dev",
	"dev-http": "gxtk dev --no-https",
	build: "gxtk build",
	"setup-ssl": "gxtk setup-ssl",
	"socket:list": "gxtk socket list",
	"socket:send": "gxtk socket send",
	"assets:list": "gxtk assets list",
	"assets:init": "gxtk assets init",
	"assets:generate": "gxtk assets generate",
	placeholder: "gxtk assets generate",
	"datastore:list": "gxtk datastore list",
	"datastore:add": "gxtk datastore add",
	"datastore:scan": "gxtk datastore scan-strings",
	"datastore:config": "gxtk datastore config",
};

// Default ports
const DEFAULT_PORTS = {
	dev: 3060,
	socketIo: 3069,
};

// Package name for path resolution
const PACKAGE_NAME = "@gramercytech/gx-toolkit";

module.exports = {
	isWin,
	exportCmd,
	REQUIRED_DEPENDENCIES,
	REQUIRED_DEV_DEPENDENCIES,
	DEFAULT_SCRIPTS,
	DEFAULT_PORTS,
	PACKAGE_NAME,
};
