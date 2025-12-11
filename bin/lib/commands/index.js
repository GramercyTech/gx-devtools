/**
 * Commands Index
 *
 * Re-exports all command modules for convenient importing.
 */

const { initCommand } = require("./init");
const { devCommand } = require("./dev");
const { buildCommand } = require("./build");
const { publishCommand } = require("./publish");
const { setupSSLCommand } = require("./ssl");
const { datastoreCommand } = require("./datastore");
const { socketCommand } = require("./socket");
const { assetsCommand } = require("./assets");
const {
	extensionFirefoxCommand,
	extensionChromeCommand,
	extensionBuildCommand,
	extensionInstallCommand,
} = require("./extensions");
const { extractConfigCommand } = require("./extract-config");

module.exports = {
	initCommand,
	devCommand,
	buildCommand,
	publishCommand,
	setupSSLCommand,
	datastoreCommand,
	socketCommand,
	assetsCommand,
	extensionFirefoxCommand,
	extensionChromeCommand,
	extensionBuildCommand,
	extensionInstallCommand,
	extractConfigCommand,
};
