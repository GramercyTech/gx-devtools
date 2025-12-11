/**
 * Add Dependency Command
 *
 * Interactive wizard for adding API dependencies to app-manifest.json
 * Loads OpenAPI and AsyncAPI specs to help users configure dependencies.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { ENVIRONMENT_URLS } = require("../constants");
const { findProjectRoot } = require("../utils");

/**
 * Fetch JSON from a URL with timeout
 */
function fetchJson(url, timeoutMs = 15000) {
	return new Promise((resolve, reject) => {
		const client = url.startsWith("https") ? https : http;
		const options = {
			rejectUnauthorized: false, // Allow self-signed certs for local dev
			timeout: timeoutMs,
		};

		const req = client
			.get(url, options, (res) => {
				// Check for non-200 status
				if (res.statusCode !== 200) {
					reject(new Error(`HTTP ${res.statusCode} from ${url}`));
					return;
				}

				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					try {
						resolve(JSON.parse(data));
					} catch (e) {
						reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
					}
				});
			})
			.on("error", reject)
			.on("timeout", () => {
				req.destroy();
				reject(new Error(`Request timeout after ${timeoutMs}ms for ${url}`));
			});
	});
}

/**
 * Group OpenAPI paths by their tags
 */
function groupPathsByTag(openApiSpec) {
	const tagGroups = {};

	// Initialize tag groups with info from tags array
	if (openApiSpec.tags) {
		for (const tag of openApiSpec.tags) {
			tagGroups[tag.name] = {
				name: tag.name,
				description: tag.description || "",
				paths: [],
				asyncMessages: [],
			};
		}
	}

	// Group paths by their tags
	for (const [pathUrl, pathMethods] of Object.entries(openApiSpec.paths || {})) {
		for (const [method, pathInfo] of Object.entries(pathMethods)) {
			if (typeof pathInfo !== "object" || !pathInfo.tags) continue;

			for (const tag of pathInfo.tags) {
				if (!tagGroups[tag]) {
					tagGroups[tag] = {
						name: tag,
						description: "",
						paths: [],
						asyncMessages: [],
					};
				}

				// Extract permission and permission_key from x-permission
				const permission = pathInfo["x-permission"]?.permission;
				const permissionKey = pathInfo["x-permission"]?.permission_key;

				tagGroups[tag].paths.push({
					path: pathUrl,
					method: method.toUpperCase(),
					operationId: pathInfo.operationId || "",
					summary: pathInfo.summary || "",
					permission: permission || null,
					permissionKey: permissionKey || null,
				});
			}
		}
	}

	return tagGroups;
}

/**
 * Extract messages from AsyncAPI and map to tags
 */
function mapAsyncMessagesToTags(asyncApiSpec, tagGroups) {
	const messages = asyncApiSpec?.components?.messages || {};

	for (const [messageName, messageInfo] of Object.entries(messages)) {
		// Try to find matching tag based on message name
		// Messages often have format like "GameUpdated", "LeaderboardCreated" etc.
		const baseName = messageName
			.replace(/Created$|Updated$|Deleted$|Changed$|Event$/, "")
			.toLowerCase();

		for (const [tagName, tagGroup] of Object.entries(tagGroups)) {
			const tagLower = tagName.toLowerCase();
			// Match if tag contains the base name or vice versa
			if (
				tagLower.includes(baseName) ||
				baseName.includes(tagLower) ||
				tagLower === baseName
			) {
				tagGroup.asyncMessages.push({
					name: messageName,
					description: messageInfo.description || messageInfo.summary || "",
				});
			}
		}
	}

	return tagGroups;
}

/**
 * Interactive arrow-key selection with type-ahead filtering
 */
async function selectWithTypeAhead(question, options) {
	return new Promise((resolve) => {
		const stdin = process.stdin;
		const stdout = process.stdout;

		let selectedIndex = 0;
		let filter = "";
		let filteredOptions = [...options];

		const applyFilter = () => {
			if (!filter) {
				filteredOptions = [...options];
			} else {
				const lowerFilter = filter.toLowerCase();
				filteredOptions = options.filter(
					(opt) =>
						opt.label.toLowerCase().includes(lowerFilter) ||
						(opt.description && opt.description.toLowerCase().includes(lowerFilter))
				);
			}
			selectedIndex = Math.min(selectedIndex, Math.max(0, filteredOptions.length - 1));
		};

		const maxVisible = 10;

		const render = () => {
			stdout.write("\x1B[?25l"); // Hide cursor

			// Calculate scroll window
			let startIdx = 0;
			if (filteredOptions.length > maxVisible) {
				startIdx = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
				startIdx = Math.min(startIdx, filteredOptions.length - maxVisible);
			}
			const endIdx = Math.min(startIdx + maxVisible, filteredOptions.length);
			const visibleOptions = filteredOptions.slice(startIdx, endIdx);

			// Clear screen area
			const linesToClear = maxVisible + 4;
			stdout.write(`\x1B[${linesToClear}A`);
			for (let i = 0; i < linesToClear; i++) {
				stdout.write("\x1B[2K\n");
			}
			stdout.write(`\x1B[${linesToClear}A`);

			// Print question and filter
			stdout.write(`\x1B[36m?\x1B[0m ${question}\n`);
			stdout.write(`  Filter: ${filter}\x1B[90m (type to filter, arrows to navigate)\x1B[0m\n`);
			stdout.write(`\n`);

			// Print scroll indicator if needed
			if (startIdx > 0) {
				stdout.write(`  \x1B[90m↑ ${startIdx} more above\x1B[0m\n`);
			} else {
				stdout.write(`\n`);
			}

			// Print visible options
			visibleOptions.forEach((opt, i) => {
				const actualIndex = startIdx + i;
				const isSelected = actualIndex === selectedIndex;
				const prefix = isSelected ? "\x1B[36m❯\x1B[0m" : " ";
				const label = isSelected ? `\x1B[36m${opt.label}\x1B[0m` : opt.label;

				if (opt.description) {
					stdout.write(`${prefix} ${label} \x1B[90m- ${opt.description}\x1B[0m\n`);
				} else {
					stdout.write(`${prefix} ${label}\n`);
				}
			});

			// Pad remaining lines
			for (let i = visibleOptions.length; i < maxVisible; i++) {
				stdout.write(`\n`);
			}

			// Print scroll indicator if needed
			if (endIdx < filteredOptions.length) {
				stdout.write(`  \x1B[90m↓ ${filteredOptions.length - endIdx} more below\x1B[0m\n`);
			} else {
				stdout.write(`\n`);
			}

			stdout.write(`\x1B[?25h`); // Show cursor
		};

		const cleanup = () => {
			stdin.setRawMode(false);
			stdin.removeAllListeners("data");
			stdin.pause();
			// Clear UI
			const linesToClear = maxVisible + 4;
			stdout.write(`\x1B[${linesToClear}A`);
			for (let i = 0; i < linesToClear; i++) {
				stdout.write("\x1B[2K\n");
			}
			stdout.write(`\x1B[${linesToClear}A`);
		};

		// Initial render with spacing
		console.log("");
		for (let i = 0; i < maxVisible + 3; i++) {
			console.log("");
		}

		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");

		let buffer = "";
		stdin.on("data", (data) => {
			buffer += data;

			while (buffer.length > 0) {
				// Ctrl+C
				if (buffer[0] === "\x03") {
					cleanup();
					process.exit(0);
				}

				// Enter
				if (buffer[0] === "\r" || buffer[0] === "\n") {
					cleanup();
					const selected = filteredOptions[selectedIndex];
					if (selected) {
						stdout.write(`\x1B[36m?\x1B[0m ${question} \x1B[36m${selected.label}\x1B[0m\n`);
						resolve(selected.value);
					} else {
						resolve(null);
					}
					buffer = buffer.slice(1);
					return;
				}

				// Escape sequences
				if (buffer.startsWith("\x1b[A") || buffer.startsWith("\x1bOA")) {
					// Up arrow
					selectedIndex = Math.max(0, selectedIndex - 1);
					render();
					buffer = buffer.slice(3);
					continue;
				}
				if (buffer.startsWith("\x1b[B") || buffer.startsWith("\x1bOB")) {
					// Down arrow
					selectedIndex = Math.min(filteredOptions.length - 1, selectedIndex + 1);
					render();
					buffer = buffer.slice(3);
					continue;
				}
				if (buffer.startsWith("\x1b[") || buffer.startsWith("\x1bO")) {
					if (buffer.length >= 3) {
						buffer = buffer.slice(3);
						continue;
					}
					break;
				}
				if (buffer.startsWith("\x1b")) {
					if (buffer.length >= 2) {
						buffer = buffer.slice(1);
						continue;
					}
					break;
				}

				// Backspace
				if (buffer[0] === "\x7f" || buffer[0] === "\b") {
					filter = filter.slice(0, -1);
					applyFilter();
					render();
					buffer = buffer.slice(1);
					continue;
				}

				// Regular character
				if (buffer[0].charCodeAt(0) >= 32 && buffer[0].charCodeAt(0) < 127) {
					filter += buffer[0];
					applyFilter();
					render();
				}
				buffer = buffer.slice(1);
			}
		});

		render();
	});
}

/**
 * Multi-select with spacebar toggle
 */
async function multiSelectPrompt(question, options) {
	return new Promise((resolve) => {
		const stdin = process.stdin;
		const stdout = process.stdout;

		let selectedIndex = 0;
		const selected = new Set();
		const maxVisible = 10;

		const render = () => {
			stdout.write("\x1B[?25l");

			// Calculate scroll window
			let startIdx = 0;
			if (options.length > maxVisible) {
				startIdx = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
				startIdx = Math.min(startIdx, options.length - maxVisible);
			}
			const endIdx = Math.min(startIdx + maxVisible, options.length);
			const visibleOptions = options.slice(startIdx, endIdx);

			const linesToClear = maxVisible + 5;
			stdout.write(`\x1B[${linesToClear}A`);
			for (let i = 0; i < linesToClear; i++) {
				stdout.write("\x1B[2K\n");
			}
			stdout.write(`\x1B[${linesToClear}A`);

			stdout.write(`\x1B[36m?\x1B[0m ${question}\n`);
			stdout.write(`  \x1B[90m(Space to toggle, Enter to confirm, A to toggle all)\x1B[0m\n`);
			stdout.write(`  Selected: ${selected.size} of ${options.length}\n`);

			if (startIdx > 0) {
				stdout.write(`  \x1B[90m↑ ${startIdx} more above\x1B[0m\n`);
			} else {
				stdout.write(`\n`);
			}

			visibleOptions.forEach((opt, i) => {
				const actualIndex = startIdx + i;
				const isHighlighted = actualIndex === selectedIndex;
				const isSelected = selected.has(actualIndex);

				const checkbox = isSelected ? "\x1B[32m◉\x1B[0m" : "○";
				const prefix = isHighlighted ? "\x1B[36m❯\x1B[0m" : " ";
				const label = isHighlighted ? `\x1B[36m${opt.label}\x1B[0m` : opt.label;

				if (opt.description) {
					stdout.write(`${prefix} ${checkbox} ${label} \x1B[90m- ${opt.description}\x1B[0m\n`);
				} else {
					stdout.write(`${prefix} ${checkbox} ${label}\n`);
				}
			});

			for (let i = visibleOptions.length; i < maxVisible; i++) {
				stdout.write(`\n`);
			}

			if (endIdx < options.length) {
				stdout.write(`  \x1B[90m↓ ${options.length - endIdx} more below\x1B[0m\n`);
			} else {
				stdout.write(`\n`);
			}

			stdout.write(`\x1B[?25h`);
		};

		const cleanup = () => {
			stdin.setRawMode(false);
			stdin.removeAllListeners("data");
			stdin.pause();
			const linesToClear = maxVisible + 5;
			stdout.write(`\x1B[${linesToClear}A`);
			for (let i = 0; i < linesToClear; i++) {
				stdout.write("\x1B[2K\n");
			}
			stdout.write(`\x1B[${linesToClear}A`);
		};

		console.log("");
		for (let i = 0; i < maxVisible + 4; i++) {
			console.log("");
		}

		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");

		let buffer = "";
		stdin.on("data", (data) => {
			buffer += data;

			while (buffer.length > 0) {
				if (buffer[0] === "\x03") {
					cleanup();
					process.exit(0);
				}

				if (buffer[0] === "\r" || buffer[0] === "\n") {
					cleanup();
					const selectedOptions = options.filter((_, i) => selected.has(i));
					stdout.write(
						`\x1B[36m?\x1B[0m ${question} \x1B[36m${selectedOptions.length} selected\x1B[0m\n`
					);
					resolve(selectedOptions.map((opt) => opt.value));
					buffer = buffer.slice(1);
					return;
				}

				if (buffer.startsWith("\x1b[A") || buffer.startsWith("\x1bOA")) {
					selectedIndex = Math.max(0, selectedIndex - 1);
					render();
					buffer = buffer.slice(3);
					continue;
				}
				if (buffer.startsWith("\x1b[B") || buffer.startsWith("\x1bOB")) {
					selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
					render();
					buffer = buffer.slice(3);
					continue;
				}
				if (buffer.startsWith("\x1b[") || buffer.startsWith("\x1bO")) {
					if (buffer.length >= 3) {
						buffer = buffer.slice(3);
						continue;
					}
					break;
				}
				if (buffer.startsWith("\x1b")) {
					if (buffer.length >= 2) {
						buffer = buffer.slice(1);
						continue;
					}
					break;
				}

				// Spacebar toggle
				if (buffer[0] === " ") {
					if (selected.has(selectedIndex)) {
						selected.delete(selectedIndex);
					} else {
						selected.add(selectedIndex);
					}
					render();
					buffer = buffer.slice(1);
					continue;
				}

				// 'a' or 'A' toggle all
				if (buffer[0] === "a" || buffer[0] === "A") {
					if (selected.size === options.length) {
						selected.clear();
					} else {
						options.forEach((_, i) => selected.add(i));
					}
					render();
					buffer = buffer.slice(1);
					continue;
				}

				buffer = buffer.slice(1);
			}
		});

		render();
	});
}

/**
 * Text input with prepopulated value
 */
async function textInput(question, defaultValue = "") {
	return new Promise((resolve) => {
		const stdin = process.stdin;
		const stdout = process.stdout;

		let value = defaultValue;
		let cursorPos = value.length;

		const render = () => {
			stdout.write("\x1B[?25l");
			stdout.write("\r\x1B[2K");
			stdout.write(`\x1B[36m?\x1B[0m ${question}: ${value}`);
			const totalLength = question.length + 4 + cursorPos;
			stdout.write(`\r\x1B[${totalLength}C`);
			stdout.write("\x1B[?25h");
		};

		const cleanup = () => {
			stdin.setRawMode(false);
			stdin.removeAllListeners("data");
			stdin.pause();
		};

		console.log("");
		render();

		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");

		stdin.on("data", (key) => {
			if (key === "\x03") {
				cleanup();
				process.exit(0);
			}

			if (key === "\r" || key === "\n") {
				cleanup();
				stdout.write("\r\x1B[2K");
				stdout.write(`\x1B[36m?\x1B[0m ${question}: \x1B[36m${value}\x1B[0m\n`);
				resolve(value);
				return;
			}

			if (key === "\x7f" || key === "\b") {
				if (cursorPos > 0) {
					value = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
					cursorPos--;
				}
				render();
				return;
			}

			if (key === "\x1b[D") {
				cursorPos = Math.max(0, cursorPos - 1);
				render();
				return;
			}

			if (key === "\x1b[C") {
				cursorPos = Math.min(value.length, cursorPos + 1);
				render();
				return;
			}

			if (key.length === 1 && key.charCodeAt(0) >= 32 && key.charCodeAt(0) < 127) {
				value = value.slice(0, cursorPos) + key + value.slice(cursorPos);
				cursorPos++;
				render();
			}
		});
	});
}

/**
 * Main command handler
 */
async function addDependencyCommand(argv) {
	const environment = argv.env || "staging";

	console.log("");
	console.log("\x1B[36m╔════════════════════════════════════════════╗\x1B[0m");
	console.log("\x1B[36m║       Add API Dependency Wizard            ║\x1B[0m");
	console.log("\x1B[36m╚════════════════════════════════════════════╝\x1B[0m");
	console.log("");

	// Get environment URLs
	const envUrls = ENVIRONMENT_URLS[environment];
	if (!envUrls) {
		console.error(`\x1B[31m✗ Unknown environment: ${environment}\x1B[0m`);
		console.log(`  Available: ${Object.keys(ENVIRONMENT_URLS).join(", ")}`);
		process.exit(1);
	}

	console.log(`\x1B[90mEnvironment: ${environment}\x1B[0m`);
	console.log(`\x1B[90mLoading API specifications...\x1B[0m`);

	// Fetch specs
	let openApiSpec, asyncApiSpec;
	try {
		[openApiSpec, asyncApiSpec] = await Promise.all([
			fetchJson(envUrls.openApiSpec),
			fetchJson(envUrls.asyncApiSpec).catch(() => ({ components: { messages: {} } })),
		]);
	} catch (error) {
		console.error(`\x1B[31m✗ Failed to load API specs: ${error.message}\x1B[0m`);
		process.exit(1);
	}

	console.log(`\x1B[32m✓ Loaded OpenAPI spec\x1B[0m`);
	console.log(`\x1B[32m✓ Loaded AsyncAPI spec\x1B[0m`);
	console.log("");

	// Group paths by tags and map async messages
	let tagGroups = groupPathsByTag(openApiSpec);
	tagGroups = mapAsyncMessagesToTags(asyncApiSpec, tagGroups);

	// Filter out empty tags
	const tags = Object.values(tagGroups)
		.filter((t) => t.paths.length > 0)
		.sort((a, b) => a.name.localeCompare(b.name));

	if (tags.length === 0) {
		console.error("\x1B[31m✗ No API tags found in spec\x1B[0m");
		process.exit(1);
	}

	// Step 1: Select a tag
	const tagOptions = tags.map((t) => ({
		label: t.name,
		description: `${t.paths.length} endpoints${t.asyncMessages.length > 0 ? `, ${t.asyncMessages.length} events` : ""}`,
		value: t,
	}));

	const selectedTag = await selectWithTypeAhead("Select an API model (tag):", tagOptions);

	if (!selectedTag) {
		console.log("Cancelled.");
		process.exit(0);
	}

	console.log("");

	// Step 2: Select paths
	const pathOptions = selectedTag.paths.map((p) => ({
		label: `${p.method} ${p.path}`,
		description: p.summary,
		value: p,
	}));

	const selectedPaths = await multiSelectPrompt(
		`Select API endpoints for ${selectedTag.name}:`,
		pathOptions
	);

	if (selectedPaths.length === 0) {
		console.log("\x1B[33m⚠ No endpoints selected. Using all endpoints.\x1B[0m");
		selectedPaths.push(...selectedTag.paths);
	}

	console.log("");

	// Step 3: Select async messages (if any)
	let selectedMessages = [];
	if (selectedTag.asyncMessages.length > 0) {
		const messageOptions = selectedTag.asyncMessages.map((m) => ({
			label: m.name,
			description: m.description,
			value: m,
		}));

		selectedMessages = await multiSelectPrompt(
			`Select socket events for ${selectedTag.name}:`,
			messageOptions
		);
		console.log("");
	}

	// Step 4: Enter identifier
	const defaultIdentifier = selectedTag.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_|_$/g, "");

	const identifier = await textInput("Enter dependency identifier:", defaultIdentifier);

	// Collect all permissions from selected paths
	const allPermissions = new Set();
	let permissionKey = null;
	for (const pathInfo of selectedPaths) {
		if (pathInfo.permission) {
			allPermissions.add(pathInfo.permission);
		}
		// Get permission_key from first path that has it (should be same for all)
		if (!permissionKey && pathInfo.permissionKey) {
			permissionKey = pathInfo.permissionKey;
		}
	}

	// Build operations object from selected paths
	const operations = {};
	for (const pathInfo of selectedPaths) {
		if (pathInfo.operationId) {
			// Remove "portal.v1.project." prefix from operationId
			const cleanOperationId = pathInfo.operationId.replace(/^portal\.v1\.project\./, "");
			// Prepend method to path (e.g., "get:/v1/projects/...")
			operations[cleanOperationId] = `${pathInfo.method.toLowerCase()}:${pathInfo.path}`;
		}
	}

	// Build events object
	const events = {};
	for (const msg of selectedMessages) {
		events[msg.name] = msg.name;
	}

	// Build the dependency object
	const dependency = {
		identifier,
		model: selectedTag.name,
		permissionKey: permissionKey,
		permissions: Array.from(allPermissions).sort(),
		operations,
		events,
	};

	console.log("");
	console.log("\x1B[36m─────────────────────────────────────────────\x1B[0m");
	console.log("\x1B[36mGenerated Dependency Configuration:\x1B[0m");
	console.log("\x1B[36m─────────────────────────────────────────────\x1B[0m");
	console.log(JSON.stringify(dependency, null, 2));
	console.log("");

	// Find and update app-manifest.json
	const projectPath = findProjectRoot();
	const manifestPath = path.join(projectPath, "app-manifest.json");

	if (!fs.existsSync(manifestPath)) {
		console.log("\x1B[33m⚠ app-manifest.json not found. Creating new file.\x1B[0m");
		const manifest = { dependencies: [dependency] };
		fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
		console.log(`\x1B[32m✓ Created app-manifest.json with dependency\x1B[0m`);
	} else {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
		manifest.dependencies = manifest.dependencies || [];

		// Check for existing dependency with same identifier
		const existingIndex = manifest.dependencies.findIndex(
			(d) => d.identifier === identifier
		);

		if (existingIndex >= 0) {
			manifest.dependencies[existingIndex] = dependency;
			console.log(`\x1B[32m✓ Updated existing dependency: ${identifier}\x1B[0m`);
		} else {
			manifest.dependencies.push(dependency);
			console.log(`\x1B[32m✓ Added new dependency: ${identifier}\x1B[0m`);
		}

		fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
	}

	console.log(`\x1B[32m✓ Saved to ${manifestPath}\x1B[0m`);
	console.log("");
}

module.exports = {
	addDependencyCommand,
};
