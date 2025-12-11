/**
 * Utility Functions Index
 *
 * Re-exports all utility modules for convenient importing.
 */

const paths = require("./paths");
const ssl = require("./ssl");
const files = require("./files");
const prompts = require("./prompts");
const aiScaffold = require("./ai-scaffold");
const extractConfig = require("./extract-config");

module.exports = {
	...paths,
	...ssl,
	...files,
	...prompts,
	...aiScaffold,
	...extractConfig,
};
