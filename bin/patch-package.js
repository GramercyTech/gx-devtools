#! /usr/bin/env node

const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(
	__dirname,
	"..",
	"..",
	"..",
	"..",
	"package.json"
);
if (!fs.existsSync(packageJsonPath)) {
	console.error("package.json not found");
	process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

// Ensure scripts object exists
if (!packageJson.scripts) {
	packageJson.scripts = {};
}

// Add or update scripts
const scriptsToAdd = {
	gxgo: "gxgo",
	init: "gxgo init",
	dev: "gxgo dev",
	build: "gxgo build",
	tunnel: "gxgo tunnel",
	"generate-config": "gxgo generate-config",
};

Object.assign(packageJson.scripts, scriptsToAdd);

// Write updated package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log("Scripts added to package.json successfully.");
