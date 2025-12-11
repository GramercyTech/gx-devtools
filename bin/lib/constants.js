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
	"@faker-js/faker": "^9.2.0",
	"json-schema-faker": "^0.5.6",
};

const REQUIRED_DEV_DEPENDENCIES = {
	"@gxp-dev/tools": "^2.0.0",
	nodemon: "^3.1.7",
	concurrently: "^9.0.1",
	mkcert: "^3.2.0",
};

// Default scripts for package.json
const DEFAULT_SCRIPTS = {
	dev: "gxdev dev --with-socket",
	"dev-app": "gxdev dev",
	"dev-http": "gxdev dev --no-https",
	build: "gxdev build",
	"setup-ssl": "gxdev setup-ssl",
	"socket:list": "gxdev socket list",
	"socket:send": "gxdev socket send",
	"assets:list": "gxdev assets list",
	"assets:init": "gxdev assets init",
	"assets:generate": "gxdev assets generate",
	placeholder: "gxdev assets generate",
	"datastore:list": "gxdev datastore list",
	"datastore:add": "gxdev datastore add",
	"datastore:scan": "gxdev datastore scan-strings",
	"datastore:config": "gxdev datastore config",
};

// Default ports
const DEFAULT_PORTS = {
	dev: 3060,
	socketIo: 3069,
};

const ENVIRONMENT_URLS = {
	production: {
		apiBaseUrl: "https://api.gramercy.cloud",
		// documentation: "https://api.gramercy.cloud/docs/",
		// openApiSpec: "https://api.gramercy.cloud/api-specs/openapi.json",
		// asyncApiSpec: "https://api.gramercy.cloud/api-specs/asyncapi.json",
		// webhookSpec: "https://api.gramercy.cloud/api-specs/webhooks.json",
		documentation: "https://api.zenith-develop.env.eventfinity.app/docs/",
		openApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/webhooks.json",
	},
	staging: {
		apiBaseUrl: "https://api.efz-staging.env.eventfinity.app",
		// documentation: "https://api.eventfinity.test/docs/",
		// openApiSpec:
		// 	"https://api.efz-staging.env.eventfinity.app/api-specs/openapi.json",
		// asyncApiSpec:
		// 	"https://api.efz-staging.env.eventfinity.app/api-specs/asyncapi.json",
		// webhookSpec:
		// 	"https://api.efz-staging.env.eventfinity.app/api-specs/webhooks.json",
		documentation: "https://api.zenith-develop.env.eventfinity.app/docs/",
		openApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/webhooks.json",
	},
	testing: {
		apiBaseUrl: "https://api.zenith-develop-testing.env.eventfinity.app",
		documentation: "https://api.zenith-develop.env.eventfinity.app/docs/",
		openApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/webhooks.json",
	},
	develop: {
		apiBaseUrl: "https://api.zenith-develop.env.eventfinity.app",
		documentation: "https://api.zenith-develop.env.eventfinity.app/docs/",
		openApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/openapi.json",
		asyncApiSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/asyncapi.json",
		webhookSpec:
			"https://api.zenith-develop.env.eventfinity.app/api-specs/webhooks.json",
	},
	local: {
		apiBaseUrl: "https://dashboard.eventfinity.test",
		documentation: "https://api.eventfinity.test/docs/",
		openApiSpec: "https://api.eventfinity.test/api-specs/openapi.json",
		asyncApiSpec: "https://api.eventfinity.test/api-specs/asyncapi.json",
		webhookSpec: "https://api.eventfinity.test/api-specs/webhooks.json",
	},
};

// Package name for path resolution
const PACKAGE_NAME = "@gxp-dev/tools";

module.exports = {
	isWin,
	exportCmd,
	REQUIRED_DEPENDENCIES,
	REQUIRED_DEV_DEPENDENCIES,
	DEFAULT_SCRIPTS,
	DEFAULT_PORTS,
	PACKAGE_NAME,
	ENVIRONMENT_URLS,
};
