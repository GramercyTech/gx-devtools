/**
 * AI Scaffolding Service
 *
 * Uses AI to generate plugin scaffolding based on user prompts.
 * Supports multiple AI providers:
 * - Claude (via claude CLI - uses logged-in account)
 * - Codex (via codex CLI - uses logged-in account)
 * - Gemini (via API key or gcloud CLI)
 */

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

// AI scaffolding prompt template
const SCAFFOLD_SYSTEM_PROMPT = `You are an expert GxP plugin developer assistant. Your task is to help create Vue.js plugin components for the GxP platform.

## GxP Plugin Architecture

GxP plugins are Vue 3 Single File Components (SFCs) that run on kiosk displays. They use:
- Vue 3 Composition API with <script setup>
- Pinia for state management via the GxP Store
- GxP Component Kit (@gramercytech/gx-componentkit) for UI components
- gxp-string and gxp-src directives for dynamic content

## Key Components Available

From GxP Component Kit:
- GxButton - Styled buttons with variants (primary, secondary, outline)
- GxCard - Card containers with optional header/footer
- GxInput - Form inputs with validation
- GxModal - Modal dialogs
- GxSpinner - Loading indicators
- GxAlert - Alert/notification messages
- GxBadge - Status badges
- GxAvatar - User avatars
- GxProgress - Progress bars
- GxTabs - Tab navigation
- GxAccordion - Collapsible sections

## GxP Store Usage

\`\`\`javascript
import { useGxpStore } from '@gx-runtime/stores/gxpPortalConfigStore';

const store = useGxpStore();

// Get values
store.getString('key', 'default');      // From stringsList
store.getSetting('key', 'default');     // From pluginVars/settings
store.getAsset('key', '/fallback.jpg'); // From assetList
store.getState('key', null);            // From triggerState

// Update values
store.updateString('key', 'value');
store.updateSetting('key', 'value');
store.updateAsset('key', 'url');
store.updateState('key', 'value');

// API calls
await store.apiGet('/endpoint', { params });
await store.apiPost('/endpoint', data);

// Socket events
store.listenSocket('primary', 'EventName', callback);
store.emitSocket('primary', 'event', data);
\`\`\`

## GxP Directives

\`\`\`html
<!-- Replace text from strings -->
<h1 gxp-string="welcome_title">Default Title</h1>

<!-- Replace text from settings -->
<span gxp-string="company_name" gxp-settings>Company</span>

<!-- Replace image src from assets -->
<img gxp-src="hero_image" src="/placeholder.jpg" alt="Hero">
\`\`\`

## Response Format

When asked to generate code, respond with a JSON object containing:
1. "components" - Array of Vue SFC files to create
2. "manifest" - Updates to app-manifest.json (strings, assets, settings)
3. "explanation" - Brief explanation of what was created

Example response:
\`\`\`json
{
  "components": [
    {
      "path": "src/views/CheckInView.vue",
      "content": "<template>...</template>\\n<script setup>...</script>\\n<style scoped>...</style>"
    }
  ],
  "manifest": {
    "strings": {
      "default": {
        "checkin_title": "Check In",
        "checkin_button": "Submit"
      }
    },
    "assets": {
      "checkin_logo": "/dev-assets/images/logo.png"
    }
  },
  "explanation": "Created a check-in view with form inputs and validation."
}
\`\`\`

## Important Guidelines

1. Always use GxP Component Kit components when available
2. Use gxp-string for all user-facing text
3. Use gxp-src for all images
4. Keep components focused and modular
5. Include proper TypeScript types where beneficial
6. Add scoped styles for component-specific CSS
7. Use Composition API with <script setup>
8. Handle loading and error states appropriately
`;

/**
 * Available AI providers
 */
const AI_PROVIDERS = {
	claude: {
		name: "Claude",
		description: "Anthropic Claude (uses logged-in claude CLI)",
		checkAvailable: checkClaudeAvailable,
		generate: generateWithClaude,
	},
	codex: {
		name: "Codex",
		description: "OpenAI Codex (uses logged-in codex CLI)",
		checkAvailable: checkCodexAvailable,
		generate: generateWithCodex,
	},
	gemini: {
		name: "Gemini",
		description: "Google Gemini (API key or gcloud CLI)",
		checkAvailable: checkGeminiAvailable,
		generate: generateWithGemini,
	},
};

/**
 * Check if Claude CLI is available and logged in
 * @returns {Promise<{available: boolean, reason?: string}>}
 */
async function checkClaudeAvailable() {
	try {
		// Check if claude CLI exists
		execSync("which claude", { stdio: "pipe" });

		// Check if logged in by running a simple command
		// Claude CLI doesn't have a direct "whoami" but we can check if it works
		return { available: true };
	} catch (error) {
		return {
			available: false,
			reason:
				"Claude CLI not installed. Install with: npm install -g @anthropic-ai/claude-code",
		};
	}
}

/**
 * Check if Codex CLI is available and logged in
 * @returns {Promise<{available: boolean, reason?: string}>}
 */
async function checkCodexAvailable() {
	try {
		// Check if codex CLI exists
		execSync("which codex", { stdio: "pipe" });
		return { available: true };
	} catch (error) {
		return {
			available: false,
			reason:
				"Codex CLI not installed. Install with: npm install -g @openai/codex",
		};
	}
}

/**
 * Check if Gemini is available (CLI, API key, or gcloud)
 * @returns {Promise<{available: boolean, reason?: string, method?: string}>}
 */
async function checkGeminiAvailable() {
	// Check for Gemini CLI first (preferred - uses logged-in account)
	try {
		execSync("which gemini", { stdio: "pipe" });
		// Gemini CLI is installed - it handles its own auth
		return { available: true, method: "cli" };
	} catch (error) {
		// Gemini CLI not installed
	}

	// Check for API key
	const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
	if (apiKey) {
		return { available: true, method: "api_key" };
	}

	// Check for gcloud CLI with auth
	try {
		execSync("which gcloud", { stdio: "pipe" });
		const authList = execSync("gcloud auth list --format='value(account)'", {
			stdio: "pipe",
		}).toString();
		if (authList.trim()) {
			return { available: true, method: "gcloud" };
		}
	} catch (error) {
		// gcloud not available or not authenticated
	}

	return {
		available: false,
		reason:
			"Gemini requires one of:\n" +
			"  • Gemini CLI logged in (npm i -g @google/gemini-cli && gemini), or\n" +
			"  • GEMINI_API_KEY environment variable, or\n" +
			"  • gcloud CLI logged in (gcloud auth login)",
	};
}

/**
 * Get list of available AI providers
 * @returns {Promise<Array<{id: string, name: string, description: string, available: boolean, reason?: string}>>}
 */
async function getAvailableProviders() {
	const providers = [];

	for (const [id, provider] of Object.entries(AI_PROVIDERS)) {
		const status = await provider.checkAvailable();
		providers.push({
			id,
			name: provider.name,
			description: provider.description,
			available: status.available,
			reason: status.reason,
			method: status.method,
		});
	}

	return providers;
}

/**
 * Generate scaffold using Claude CLI
 * @param {string} userPrompt - User's description
 * @param {string} projectName - Project name
 * @param {string} description - Project description
 * @returns {Promise<object|null>}
 */
async function generateWithClaude(userPrompt, projectName, description) {
	const fullPrompt = buildFullPrompt(userPrompt, projectName, description);

	return new Promise((resolve) => {
		console.log("\n🤖 Generating plugin scaffold with Claude...\n");
		console.log("─".repeat(50));

		let output = "";
		let errorOutput = "";

		// Use claude CLI with --print flag to get direct output
		const claude = spawn(
			"claude",
			["--print", "-p", `${SCAFFOLD_SYSTEM_PROMPT}\n\n${fullPrompt}`],
			{
				stdio: ["pipe", "pipe", "pipe"],
				shell: true,
			}
		);

		claude.stdout.on("data", (data) => {
			const chunk = data.toString();
			output += chunk;
			// Stream output to user in real-time
			process.stdout.write(chunk);
		});

		claude.stderr.on("data", (data) => {
			const chunk = data.toString();
			errorOutput += chunk;
			// Show stderr as well (may contain progress info)
			process.stderr.write(chunk);
		});

		claude.on("close", (code) => {
			console.log("\n" + "─".repeat(50));

			if (code !== 0) {
				console.error(`\n❌ Claude CLI error (exit code ${code})`);
				if (errorOutput) {
					console.error(errorOutput);
				}
				resolve(null);
				return;
			}

			if (!output.trim()) {
				console.error("❌ No response received from Claude");
				resolve(null);
				return;
			}

			const scaffoldData = parseAIResponse(output);
			if (!scaffoldData) {
				console.error("\n❌ Could not parse Claude response as JSON");
				console.log("The AI response was shown above but couldn't be parsed into scaffold data.");
				resolve(null);
				return;
			}

			if (scaffoldData.explanation) {
				console.log("\n📝 AI Explanation:");
				console.log(`   ${scaffoldData.explanation}`);
				console.log("");
			}

			resolve(scaffoldData);
		});

		claude.on("error", (err) => {
			console.error(`❌ Failed to run Claude CLI: ${err.message}`);
			resolve(null);
		});
	});
}

/**
 * Generate scaffold using Codex CLI
 * @param {string} userPrompt - User's description
 * @param {string} projectName - Project name
 * @param {string} description - Project description
 * @returns {Promise<object|null>}
 */
async function generateWithCodex(userPrompt, projectName, description) {
	const fullPrompt = buildFullPrompt(userPrompt, projectName, description);

	return new Promise((resolve) => {
		console.log("\n🤖 Generating plugin scaffold with Codex...\n");
		console.log("─".repeat(50));

		let output = "";
		let errorOutput = "";

		// Use codex CLI
		const codex = spawn(
			"codex",
			["--quiet", "-p", `${SCAFFOLD_SYSTEM_PROMPT}\n\n${fullPrompt}`],
			{
				stdio: ["pipe", "pipe", "pipe"],
				shell: true,
			}
		);

		codex.stdout.on("data", (data) => {
			const chunk = data.toString();
			output += chunk;
			// Stream output to user in real-time
			process.stdout.write(chunk);
		});

		codex.stderr.on("data", (data) => {
			const chunk = data.toString();
			errorOutput += chunk;
			// Show stderr as well
			process.stderr.write(chunk);
		});

		codex.on("close", (code) => {
			console.log("\n" + "─".repeat(50));

			if (code !== 0) {
				console.error(`\n❌ Codex CLI error (exit code ${code})`);
				if (errorOutput) {
					console.error(errorOutput);
				}
				resolve(null);
				return;
			}

			if (!output.trim()) {
				console.error("❌ No response received from Codex");
				resolve(null);
				return;
			}

			const scaffoldData = parseAIResponse(output);
			if (!scaffoldData) {
				console.error("\n❌ Could not parse Codex response as JSON");
				console.log("The AI response was shown above but couldn't be parsed into scaffold data.");
				resolve(null);
				return;
			}

			if (scaffoldData.explanation) {
				console.log("\n📝 AI Explanation:");
				console.log(`   ${scaffoldData.explanation}`);
				console.log("");
			}

			resolve(scaffoldData);
		});

		codex.on("error", (err) => {
			console.error(`❌ Failed to run Codex CLI: ${err.message}`);
			resolve(null);
		});
	});
}

/**
 * Generate scaffold using Gemini (CLI, API key, or gcloud)
 * @param {string} userPrompt - User's description
 * @param {string} projectName - Project name
 * @param {string} description - Project description
 * @param {string} method - 'cli', 'api_key', or 'gcloud'
 * @returns {Promise<object|null>}
 */
async function generateWithGemini(
	userPrompt,
	projectName,
	description,
	method
) {
	const fullPrompt = buildFullPrompt(userPrompt, projectName, description);

	// Use the appropriate method
	if (method === "cli") {
		return generateWithGeminiCli(fullPrompt);
	}

	const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
	if (method === "api_key" && apiKey) {
		return generateWithGeminiApiKey(fullPrompt, apiKey);
	}

	return generateWithGeminiGcloud(fullPrompt);
}

/**
 * Generate using Gemini CLI
 */
async function generateWithGeminiCli(fullPrompt) {
	return new Promise((resolve) => {
		console.log("\n🤖 Generating plugin scaffold with Gemini CLI...\n");
		console.log("─".repeat(50));

		let output = "";
		let errorOutput = "";

		// Use gemini CLI with -p for prompt mode
		const gemini = spawn(
			"gemini",
			["-p", `${SCAFFOLD_SYSTEM_PROMPT}\n\n${fullPrompt}`],
			{
				stdio: ["pipe", "pipe", "pipe"],
				shell: true,
			}
		);

		gemini.stdout.on("data", (data) => {
			const chunk = data.toString();
			output += chunk;
			// Stream output to user in real-time
			process.stdout.write(chunk);
		});

		gemini.stderr.on("data", (data) => {
			const chunk = data.toString();
			errorOutput += chunk;
			// Show stderr as well
			process.stderr.write(chunk);
		});

		gemini.on("close", (code) => {
			console.log("\n" + "─".repeat(50));

			if (code !== 0) {
				console.error(`\n❌ Gemini CLI error (exit code ${code})`);
				if (errorOutput) {
					console.error(errorOutput);
				}
				resolve(null);
				return;
			}

			if (!output.trim()) {
				console.error("❌ No response received from Gemini CLI");
				resolve(null);
				return;
			}

			const scaffoldData = parseAIResponse(output);
			if (!scaffoldData) {
				console.error("\n❌ Could not parse Gemini response as JSON");
				console.log("The AI response was shown above but couldn't be parsed into scaffold data.");
				resolve(null);
				return;
			}

			if (scaffoldData.explanation) {
				console.log("\n📝 AI Explanation:");
				console.log(`   ${scaffoldData.explanation}`);
				console.log("");
			}

			resolve(scaffoldData);
		});

		gemini.on("error", (err) => {
			console.error(`❌ Failed to run Gemini CLI: ${err.message}`);
			resolve(null);
		});
	});
}

/**
 * Generate using Gemini API with API key
 */
async function generateWithGeminiApiKey(fullPrompt, apiKey) {
	try {
		console.log("\n🤖 Generating plugin scaffold with Gemini API...\n");
		console.log("─".repeat(50));
		console.log("Sending request to Gemini API...");

		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					contents: [
						{
							role: "user",
							parts: [{ text: SCAFFOLD_SYSTEM_PROMPT }, { text: fullPrompt }],
						},
					],
					generationConfig: {
						maxOutputTokens: 8192,
						temperature: 0.7,
					},
				}),
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`\n❌ Gemini API error: ${response.status}`);
			console.error(errorText);
			console.log("─".repeat(50));
			return null;
		}

		const data = await response.json();
		const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

		if (!responseText) {
			console.error("❌ No response from Gemini API");
			console.log("─".repeat(50));
			return null;
		}

		// Show the response to user
		console.log("\nGemini Response:\n");
		console.log(responseText);
		console.log("\n" + "─".repeat(50));

		const scaffoldData = parseAIResponse(responseText);

		if (!scaffoldData) {
			console.error("\n❌ Could not parse Gemini response as JSON");
			console.log("The AI response was shown above but couldn't be parsed into scaffold data.");
			return null;
		}

		if (scaffoldData.explanation) {
			console.log("\n📝 AI Explanation:");
			console.log(`   ${scaffoldData.explanation}`);
			console.log("");
		}

		return scaffoldData;
	} catch (error) {
		console.error(`❌ Gemini API failed: ${error.message}`);
		return null;
	}
}

/**
 * Generate using Gemini via gcloud CLI
 */
async function generateWithGeminiGcloud(fullPrompt) {
	return new Promise((resolve) => {
		console.log("\n🤖 Generating plugin scaffold with Gemini (via gcloud)...\n");
		console.log("─".repeat(50));

		// Get access token from gcloud
		let accessToken;
		try {
			console.log("Getting gcloud access token...");
			accessToken = execSync("gcloud auth print-access-token", {
				stdio: "pipe",
			})
				.toString()
				.trim();
		} catch (error) {
			console.error("❌ Failed to get gcloud access token");
			console.log("─".repeat(50));
			resolve(null);
			return;
		}

		// Get project ID
		let projectId;
		try {
			projectId = execSync("gcloud config get-value project", {
				stdio: "pipe",
			})
				.toString()
				.trim();
			console.log(`Using project: ${projectId}`);
		} catch (error) {
			console.error("❌ Failed to get gcloud project ID");
			console.log("─".repeat(50));
			resolve(null);
			return;
		}

		console.log("Sending request to Gemini...\n");

		const requestBody = JSON.stringify({
			contents: [
				{
					role: "user",
					parts: [{ text: SCAFFOLD_SYSTEM_PROMPT }, { text: fullPrompt }],
				},
			],
			generationConfig: {
				maxOutputTokens: 8192,
				temperature: 0.7,
			},
		});

		// Use curl to make the request (more reliable than fetch with gcloud auth)
		const curl = spawn(
			"curl",
			[
				"-s",
				"-X",
				"POST",
				`https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-1.5-flash:generateContent`,
				"-H",
				`Authorization: Bearer ${accessToken}`,
				"-H",
				"Content-Type: application/json",
				"-d",
				requestBody,
			],
			{ stdio: ["pipe", "pipe", "pipe"] }
		);

		let output = "";
		let errorOutput = "";

		curl.stdout.on("data", (data) => {
			output += data.toString();
		});

		curl.stderr.on("data", (data) => {
			errorOutput += data.toString();
		});

		curl.on("close", (code) => {
			if (code !== 0) {
				console.error(`❌ Gemini gcloud error: ${errorOutput}`);
				console.log("─".repeat(50));
				resolve(null);
				return;
			}

			try {
				const data = JSON.parse(output);
				const responseText =
					data.candidates?.[0]?.content?.parts?.[0]?.text || "";

				if (!responseText) {
					console.error("❌ No response from Gemini");
					console.log("─".repeat(50));
					resolve(null);
					return;
				}

				// Show the response to user
				console.log("Gemini Response:\n");
				console.log(responseText);
				console.log("\n" + "─".repeat(50));

				const scaffoldData = parseAIResponse(responseText);

				if (!scaffoldData) {
					console.error("\n❌ Could not parse Gemini response as JSON");
					console.log("The AI response was shown above but couldn't be parsed into scaffold data.");
					resolve(null);
					return;
				}

				if (scaffoldData.explanation) {
					console.log("\n📝 AI Explanation:");
					console.log(`   ${scaffoldData.explanation}`);
					console.log("");
				}

				resolve(scaffoldData);
			} catch (parseError) {
				console.error(
					`❌ Failed to parse Gemini response: ${parseError.message}`
				);
				console.log("─".repeat(50));
				resolve(null);
			}
		});
	});
}

/**
 * Build the full prompt for the AI
 */
function buildFullPrompt(userPrompt, projectName, description) {
	return `
Project Name: ${projectName}
Project Description: ${description || "A GxP kiosk plugin"}

User Request:
${userPrompt}

Please generate the necessary Vue components and manifest updates for this plugin. Follow the GxP plugin architecture guidelines. Return ONLY a valid JSON object with components, manifest, and explanation fields.
`;
}

/**
 * Parse AI response to extract structured data
 * @param {string} response - Raw AI response text
 * @returns {object|null} Parsed scaffold data or null if parsing fails
 */
function parseAIResponse(response) {
	try {
		// Try to find JSON in the response
		const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[1]);
		}

		// Try parsing the entire response as JSON
		return JSON.parse(response);
	} catch (error) {
		// Try to extract JSON object from response
		const jsonStart = response.indexOf("{");
		const jsonEnd = response.lastIndexOf("}");
		if (jsonStart !== -1 && jsonEnd !== -1) {
			try {
				return JSON.parse(response.slice(jsonStart, jsonEnd + 1));
			} catch {
				// Parsing failed
			}
		}
	}
	return null;
}

/**
 * Apply scaffold data to project
 * @param {string} projectPath - Path to project directory
 * @param {object} scaffoldData - Parsed scaffold data from AI
 * @returns {object} Result with created files and updates
 */
function applyScaffold(projectPath, scaffoldData) {
	const result = {
		filesCreated: [],
		manifestUpdated: false,
		errors: [],
	};

	// Create component files
	if (scaffoldData.components && Array.isArray(scaffoldData.components)) {
		for (const component of scaffoldData.components) {
			if (component.path && component.content) {
				try {
					const filePath = path.join(projectPath, component.path);
					const dirPath = path.dirname(filePath);

					// Create directory if needed
					if (!fs.existsSync(dirPath)) {
						fs.mkdirSync(dirPath, { recursive: true });
					}

					// Write file
					fs.writeFileSync(filePath, component.content);
					result.filesCreated.push(component.path);
					console.log(`✓ Created ${component.path}`);
				} catch (error) {
					result.errors.push(
						`Failed to create ${component.path}: ${error.message}`
					);
					console.error(
						`✗ Failed to create ${component.path}: ${error.message}`
					);
				}
			}
		}
	}

	// Update manifest
	if (scaffoldData.manifest) {
		try {
			const manifestPath = path.join(projectPath, "app-manifest.json");
			let manifest = {};

			if (fs.existsSync(manifestPath)) {
				manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
			}

			// Merge strings
			if (scaffoldData.manifest.strings) {
				manifest.strings = manifest.strings || {};
				manifest.strings.default = manifest.strings.default || {};
				Object.assign(
					manifest.strings.default,
					scaffoldData.manifest.strings.default || scaffoldData.manifest.strings
				);
			}

			// Merge assets
			if (scaffoldData.manifest.assets) {
				manifest.assets = manifest.assets || {};
				Object.assign(manifest.assets, scaffoldData.manifest.assets);
			}

			// Merge settings
			if (scaffoldData.manifest.settings) {
				manifest.settings = manifest.settings || {};
				Object.assign(manifest.settings, scaffoldData.manifest.settings);
			}

			fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t"));
			result.manifestUpdated = true;
			console.log("✓ Updated app-manifest.json");
		} catch (error) {
			result.errors.push(`Failed to update manifest: ${error.message}`);
			console.error(`✗ Failed to update manifest: ${error.message}`);
		}
	}

	return result;
}

/**
 * Generate scaffold using specified provider
 * @param {string} provider - Provider ID (claude, codex, gemini)
 * @param {string} userPrompt - User's description of what to build
 * @param {string} projectName - Name of the project
 * @param {string} description - Project description
 * @returns {Promise<object|null>} Scaffold data or null if generation fails
 */
async function generateScaffold(
	provider,
	userPrompt,
	projectName,
	description
) {
	const providerConfig = AI_PROVIDERS[provider];
	if (!providerConfig) {
		console.error(`❌ Unknown AI provider: ${provider}`);
		return null;
	}

	const status = await providerConfig.checkAvailable();
	if (!status.available) {
		console.error(`❌ ${providerConfig.name} is not available:`);
		console.error(`   ${status.reason}`);
		return null;
	}

	return providerConfig.generate(
		userPrompt,
		projectName,
		description,
		status.method
	);
}

/**
 * Run AI scaffolding for a project
 * @param {string} projectPath - Path to project directory
 * @param {string} projectName - Name of the project
 * @param {string} description - Project description
 * @param {string} buildPrompt - User's build prompt
 * @param {string} provider - AI provider to use (claude, codex, gemini)
 * @returns {Promise<boolean>} True if scaffolding succeeded
 */
async function runAIScaffolding(
	projectPath,
	projectName,
	description,
	buildPrompt,
	provider = "gemini"
) {
	const scaffoldData = await generateScaffold(
		provider,
		buildPrompt,
		projectName,
		description
	);

	if (!scaffoldData) {
		return false;
	}

	console.log("📦 Applying scaffold to project...\n");
	const result = applyScaffold(projectPath, scaffoldData);

	console.log("");
	if (result.filesCreated.length > 0) {
		console.log(`✅ Created ${result.filesCreated.length} file(s)`);
	}
	if (result.manifestUpdated) {
		console.log("✅ Updated app-manifest.json");
	}
	if (result.errors.length > 0) {
		console.log(`⚠️  ${result.errors.length} error(s) occurred`);
	}

	return result.errors.length === 0;
}

module.exports = {
	SCAFFOLD_SYSTEM_PROMPT,
	AI_PROVIDERS,
	getAvailableProviders,
	parseAIResponse,
	applyScaffold,
	generateScaffold,
	runAIScaffolding,
};
