/**
 * GxP Component Inspector Vite Plugin
 *
 * Provides API endpoints for the browser extension to:
 * - Get component information
 * - Extract strings to the stringsList
 * - Update Vue source files
 */

import fs from "fs"
import path from "path"

/**
 * Generate a key from text content
 * @param {string} text - The text to convert to a key
 * @returns {string} - A valid key for stringsList
 */
function textToKey(text) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+/g, "_")
		.substring(0, 40)
		.replace(/_+$/, "") // Remove trailing underscores
}

/**
 * Parse JSON body from request
 */
async function parseBody(req) {
	return new Promise((resolve, reject) => {
		let body = ""
		req.on("data", (chunk) => (body += chunk))
		req.on("end", () => {
			try {
				resolve(JSON.parse(body))
			} catch (e) {
				reject(new Error("Invalid JSON"))
			}
		})
		req.on("error", reject)
	})
}

/**
 * Send JSON response
 */
function sendJson(res, data, status = 200) {
	res.statusCode = status
	res.setHeader("Content-Type", "application/json")
	res.end(JSON.stringify(data))
}

/**
 * Create the inspector plugin
 */
export function gxpInspectorPlugin() {
	return {
		name: "gxp-inspector",

		configureServer(server) {
			// API endpoint prefix
			const API_PREFIX = "/__gxp-inspector"

			// Watch for app-manifest.json changes and trigger HMR
			const manifestPath = path.join(process.cwd(), "app-manifest.json")
			let manifestWatcher = null

			// Setup manifest file watcher
			try {
				// Use chokidar if available (Vite uses it internally)
				if (server.watcher) {
					server.watcher.add(manifestPath)
					server.watcher.on("change", (changedPath) => {
						if (
							changedPath === manifestPath ||
							changedPath.endsWith("app-manifest.json")
						) {
							console.log(
								"[GxP Inspector] app-manifest.json changed, sending HMR update",
							)
							try {
								const manifest = JSON.parse(
									fs.readFileSync(manifestPath, "utf-8"),
								)
								// Send custom HMR event to all connected clients
								server.ws.send({
									type: "custom",
									event: "gxp:manifest-update",
									data: manifest,
								})
							} catch (e) {
								console.warn(
									"[GxP Inspector] Could not parse app-manifest.json:",
									e.message,
								)
								// Send reload signal if parse failed
								server.ws.send({
									type: "custom",
									event: "gxp:manifest-reload",
									data: {},
								})
							}
						}
					})
					console.log("[GxP Inspector] Watching app-manifest.json for changes")
				}
			} catch (e) {
				console.warn(
					"[GxP Inspector] Could not setup manifest watcher:",
					e.message,
				)
			}

			server.middlewares.use(async (req, res, next) => {
				// Only handle our API endpoints
				if (!req.url?.startsWith(API_PREFIX)) {
					return next()
				}

				const endpoint = req.url.replace(API_PREFIX, "").split("?")[0]

				try {
					// GET /ping - Health check
					if (req.method === "GET" && endpoint === "/ping") {
						return sendJson(res, {
							success: true,
							status: "ok",
							version: "1.0.0",
							projectRoot: process.cwd(),
						})
					}

					// GET /strings - Get current strings from app-manifest.json
					if (req.method === "GET" && endpoint === "/strings") {
						const manifestPath = path.join(process.cwd(), "app-manifest.json")

						if (!fs.existsSync(manifestPath)) {
							// Return empty strings if manifest doesn't exist yet
							return sendJson(res, {
								success: true,
								stringsList: {},
							})
						}

						const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
						return sendJson(res, {
							success: true,
							stringsList: manifest.strings?.default || {},
						})
					}

					// POST /lookup-string - Check if a text value exists in manifest and return its key
					if (req.method === "POST" && endpoint === "/lookup-string") {
						const body = await parseBody(req)
						const { text, filePath } = body

						if (!text) {
							return sendJson(
								res,
								{
									success: false,
									error: "text is required",
								},
								400,
							)
						}

						const manifestPath = path.join(process.cwd(), "app-manifest.json")
						let foundKey = null
						let isFromGetString = false

						// Check if text exists as a value in the manifest
						if (fs.existsSync(manifestPath)) {
							const manifest = JSON.parse(
								fs.readFileSync(manifestPath, "utf-8"),
							)
							const strings = manifest.strings?.default || {}

							// Find key by value
							for (const [key, value] of Object.entries(strings)) {
								if (value === text) {
									foundKey = key
									break
								}
							}
						}

						// If we found a key, check if the source file uses getString with that key
						if (foundKey && filePath) {
							const fullPath = path.resolve(process.cwd(), filePath)
							if (fs.existsSync(fullPath)) {
								const fileContent = fs.readFileSync(fullPath, "utf-8")
								// Check for getString('key' or getString("key"
								const getStringRegex = new RegExp(
									`getString\\s*\\(\\s*['"]${foundKey}['"]`,
									"g",
								)
								if (getStringRegex.test(fileContent)) {
									isFromGetString = true
								}
							}
						}

						return sendJson(res, {
							success: true,
							found: foundKey !== null,
							key: foundKey,
							isFromGetString: isFromGetString,
							text: text,
						})
					}

					// POST /update-string - Update an existing gxp-string attribute key/value in manifest and source
					if (req.method === "POST" && endpoint === "/update-string") {
						const body = await parseBody(req)
						const {
							oldKey, // The current key
							newKey, // The new key (can be same as oldKey)
							newValue, // The new default value (text content)
							filePath, // The Vue file path
						} = body

						if (!oldKey || !newKey || !filePath) {
							return sendJson(
								res,
								{
									success: false,
									error: "oldKey, newKey, and filePath are required",
								},
								400,
							)
						}

						const fullPath = path.resolve(process.cwd(), filePath)

						if (!fs.existsSync(fullPath)) {
							return sendJson(
								res,
								{
									success: false,
									error: `File not found: ${filePath}`,
								},
								404,
							)
						}

						// Read the Vue file
						let fileContent = fs.readFileSync(fullPath, "utf-8")

						// Find and replace the gxp-string attribute
						// Match: gxp-string="oldKey"
						const oldAttrRegex = new RegExp(`gxp-string="${oldKey}"`, "g")

						let replaced = false
						if (oldAttrRegex.test(fileContent)) {
							oldAttrRegex.lastIndex = 0
							fileContent = fileContent.replace(
								oldAttrRegex,
								`gxp-string="${newKey}"`,
							)
							replaced = true
						}

						if (!replaced) {
							return sendJson(
								res,
								{
									success: false,
									error: `Could not find gxp-string="${oldKey}" in ${filePath}`,
								},
								400,
							)
						}

						// Write the updated file
						fs.writeFileSync(fullPath, fileContent, "utf-8")

						// Update app-manifest.json
						const manifestPath = path.join(process.cwd(), "app-manifest.json")
						let manifest = {}

						if (fs.existsSync(manifestPath)) {
							manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
						} else {
							manifest = {
								name: "GxToolkit",
								version: "1.0.0",
								description: "GxToolkit",
								manifest_version: 3,
								settings: {},
								strings: { default: {} },
								assets: {},
							}
						}

						manifest.strings = manifest.strings || { default: {} }
						manifest.strings.default = manifest.strings.default || {}

						// Remove old key if different from new key
						if (
							oldKey !== newKey &&
							manifest.strings.default[oldKey] !== undefined
						) {
							delete manifest.strings.default[oldKey]
						}

						// Set new key with new value
						if (newValue) {
							manifest.strings.default[newKey] = newValue
						}

						fs.writeFileSync(
							manifestPath,
							JSON.stringify(manifest, null, 2),
							"utf-8",
						)

						return sendJson(res, {
							success: true,
							oldKey,
							newKey,
							newValue,
							file: filePath,
						})
					}

					// POST /extract-string - Extract a string by adding gxp-string attribute
					if (req.method === "POST" && endpoint === "/extract-string") {
						const body = await parseBody(req)
						const {
							text, // The original text to extract
							key, // Optional: custom key (otherwise generated from text)
							filePath, // The Vue file path (relative to project root)
						} = body

						if (!text || !filePath) {
							return sendJson(
								res,
								{
									success: false,
									error: "text and filePath are required",
								},
								400,
							)
						}

						const stringKey = key || textToKey(text)
						const fullPath = path.resolve(process.cwd(), filePath)

						// Validate file exists
						if (!fs.existsSync(fullPath)) {
							return sendJson(
								res,
								{
									success: false,
									error: `File not found: ${filePath}`,
								},
								404,
							)
						}

						// Read the Vue file
						let fileContent = fs.readFileSync(fullPath, "utf-8")

						// Find and replace the text in the template section
						const templateMatch = fileContent.match(
							/<template>([\s\S]*?)<\/template>/,
						)
						if (!templateMatch) {
							return sendJson(
								res,
								{
									success: false,
									error: "No template section found in file",
								},
								400,
							)
						}

						let template = templateMatch[1]
						const originalTemplate = template

						let replaced = false

						// Pattern: Find element containing the text and add gxp-string attribute
						// Match: <tag ...>text</tag> or <tag ...>text< (self-closing or nested)
						// We need to find the opening tag that contains this text

						// First try: Look for >text< pattern and work backwards to find the opening tag
						const textPattern = new RegExp(
							`(<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>\\s*)${escapeRegex(text)}(\\s*<)`,
							"g",
						)

						if (textPattern.test(template)) {
							textPattern.lastIndex = 0 // Reset regex
							template = template.replace(
								textPattern,
								(match, openTag, tagName, attrs, closeStart) => {
									// Check if gxp-string attribute already exists
									if (attrs.includes("gxp-string=")) {
										return match // Already has the attribute
									}
									// Add gxp-string attribute to the opening tag
									const newOpenTag = `<${tagName}${attrs} gxp-string="${stringKey}">`
									return `${newOpenTag}${text}${closeStart}`
								},
							)
							replaced = true
						}

						// If pattern 1 didn't work, try a simpler approach for standalone text
						if (!replaced) {
							// Look for the text and find its parent tag
							const simpleTextPattern = new RegExp(
								`(>\\s*)${escapeRegex(text)}(\\s*</)`,
								"g",
							)
							if (simpleTextPattern.test(template)) {
								// We found the text, now we need to add attribute to parent
								// This is trickier - let's find the text position and work backwards
								const textIndex = template.indexOf(`>${text}<`)
								if (textIndex !== -1) {
									// Find the opening tag before this text
									let tagStart = textIndex
									while (tagStart > 0 && template[tagStart] !== "<") {
										tagStart--
									}

									// Extract the tag
									const tagEnd = template.indexOf(">", tagStart)
									if (tagEnd !== -1 && tagEnd <= textIndex) {
										const openTag = template.substring(tagStart, tagEnd + 1)
										// Check if it already has gxp-string
										if (!openTag.includes("gxp-string=")) {
											// Add the attribute before the closing >
											const newOpenTag = openTag.replace(
												/>$/,
												` gxp-string="${stringKey}">`,
											)
											template =
												template.substring(0, tagStart) +
												newOpenTag +
												template.substring(tagEnd + 1)
											replaced = true
										}
									}
								}
							}
						}

						if (!replaced) {
							return sendJson(
								res,
								{
									success: false,
									error: `Could not find "${text}" in template section`,
									suggestion:
										"The text might be part of a more complex expression or already extracted",
								},
								400,
							)
						}

						// Update the file content with new template
						fileContent = fileContent.replace(originalTemplate, template)

						// Write the updated file
						fs.writeFileSync(fullPath, fileContent, "utf-8")

						// Now update app-manifest.json with the new string
						const manifestPath = path.join(process.cwd(), "app-manifest.json")
						let manifest = {}

						// Create default manifest structure if file doesn't exist
						if (fs.existsSync(manifestPath)) {
							manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
						} else {
							// Create default manifest
							manifest = {
								name: "GxToolkit",
								version: "1.0.0",
								description: "GxToolkit",
								manifest_version: 3,
								settings: {},
								strings: {
									default: {},
								},
								assets: {},
							}
						}

						// Ensure strings object exists
						manifest.strings = manifest.strings || { default: {} }
						manifest.strings.default = manifest.strings.default || {}

						// Only add if not already exists
						if (!manifest.strings.default[stringKey]) {
							manifest.strings.default[stringKey] = text
							fs.writeFileSync(
								manifestPath,
								JSON.stringify(manifest, null, 2),
								"utf-8",
							)
						}

						return sendJson(res, {
							success: true,
							key: stringKey,
							text: text,
							file: filePath,
							attributeAdded: true,
						})
					}

					// POST /add-string - Just add a string to app-manifest.json without modifying source
					if (req.method === "POST" && endpoint === "/add-string") {
						const body = await parseBody(req)
						const { key, value } = body

						if (!key || !value) {
							return sendJson(
								res,
								{
									success: false,
									error: "key and value are required",
								},
								400,
							)
						}

						const manifestPath = path.join(process.cwd(), "app-manifest.json")
						let manifest = {}

						// Create default manifest structure if file doesn't exist
						if (fs.existsSync(manifestPath)) {
							manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
						} else {
							manifest = {
								name: "GxToolkit",
								version: "1.0.0",
								description: "GxToolkit",
								manifest_version: 3,
								settings: {},
								strings: {
									default: {},
								},
								assets: {},
							}
						}

						// Ensure strings object exists
						manifest.strings = manifest.strings || { default: {} }
						manifest.strings.default = manifest.strings.default || {}
						manifest.strings.default[key] = value

						fs.writeFileSync(
							manifestPath,
							JSON.stringify(manifest, null, 2),
							"utf-8",
						)

						return sendJson(res, {
							success: true,
							key,
							value,
						})
					}

					// GET /file - Get file content
					if (req.method === "GET" && endpoint === "/file") {
						const url = new URL(req.url, "http://localhost")
						const filePath = url.searchParams.get("path")

						if (!filePath) {
							return sendJson(
								res,
								{
									success: false,
									error: "path parameter required",
								},
								400,
							)
						}

						const fullPath = path.resolve(process.cwd(), filePath)

						if (!fs.existsSync(fullPath)) {
							return sendJson(
								res,
								{
									success: false,
									error: "File not found",
								},
								404,
							)
						}

						const content = fs.readFileSync(fullPath, "utf-8")

						return sendJson(res, {
							success: true,
							path: filePath,
							content,
						})
					}

					// POST /update-file - Direct file update
					if (req.method === "POST" && endpoint === "/update-file") {
						const body = await parseBody(req)
						const { filePath, content, backup } = body

						if (!filePath || content === undefined) {
							return sendJson(
								res,
								{
									success: false,
									error: "filePath and content are required",
								},
								400,
							)
						}

						const fullPath = path.resolve(process.cwd(), filePath)

						// Create backup if requested
						if (backup && fs.existsSync(fullPath)) {
							const backupPath = fullPath + ".backup"
							fs.copyFileSync(fullPath, backupPath)
						}

						fs.writeFileSync(fullPath, content, "utf-8")

						return sendJson(res, {
							success: true,
							path: filePath,
						})
					}

					// POST /update-element - Edit a single element's attributes/text by source location
					// Body: { loc: "src/Plugin.vue:12:4:h1", set?: { class?, style?, text?, attrs?: {k:v} }, remove?: [names], backup? }
					// The `loc` value is the data-gxp-loc attribute stamped by the source tracker plugin.
					if (req.method === "POST" && endpoint === "/update-element") {
						const body = await parseBody(req)
						const { loc, set = {}, remove = [], backup = false } = body

						if (!loc) {
							return sendJson(
								res,
								{ success: false, error: "loc is required" },
								400,
							)
						}

						const parsedLoc = parseLoc(loc)
						if (!parsedLoc) {
							return sendJson(
								res,
								{ success: false, error: `Invalid loc format: ${loc}` },
								400,
							)
						}

						const { filePath, line, column } = parsedLoc
						const fullPath = path.resolve(process.cwd(), filePath)

						if (!fs.existsSync(fullPath)) {
							return sendJson(
								res,
								{ success: false, error: `File not found: ${filePath}` },
								404,
							)
						}

						const fileContent = fs.readFileSync(fullPath, "utf-8")
						const offset = lineColToOffset(fileContent, line, column)
						const tag = readOpeningTagAt(fileContent, offset)

						if (!tag || !tag.tagName) {
							return sendJson(
								res,
								{
									success: false,
									error: `Could not locate an opening tag at ${filePath}:${line}:${column}`,
								},
								400,
							)
						}

						const newOpenTag = applyTagEdits(tag.text, { set, remove })
						let newContent =
							fileContent.slice(0, tag.start) +
							newOpenTag +
							fileContent.slice(tag.end)

						// Optional inner-text replacement for leaf elements (text up to the next tag)
						let textApplied = false
						if (typeof set.text === "string" && !tag.selfClosing) {
							const result = replaceLeafText(
								newContent,
								tag.start + newOpenTag.length,
								set.text,
							)
							newContent = result.content
							textApplied = result.applied
						}

						if (backup) {
							fs.copyFileSync(fullPath, fullPath + ".backup")
						}
						fs.writeFileSync(fullPath, newContent, "utf-8")

						return sendJson(res, {
							success: true,
							file: filePath,
							tag: tag.tagName,
							applied: { set, remove, textApplied },
						})
					}

					// POST /add-asset - Add an asset URL to app-manifest.json (assets section)
					if (req.method === "POST" && endpoint === "/add-asset") {
						const body = await parseBody(req)
						const { key, value } = body

						if (!key || value === undefined) {
							return sendJson(
								res,
								{ success: false, error: "key and value are required" },
								400,
							)
						}

						const manifestPath = path.join(process.cwd(), "app-manifest.json")
						let manifest = {}

						if (fs.existsSync(manifestPath)) {
							manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
						} else {
							manifest = {
								name: "GxToolkit",
								version: "1.0.0",
								description: "GxToolkit",
								manifest_version: 3,
								settings: {},
								strings: { default: {} },
								assets: {},
							}
						}

						manifest.assets = manifest.assets || {}
						manifest.assets[key] = value

						fs.writeFileSync(
							manifestPath,
							JSON.stringify(manifest, null, 2),
							"utf-8",
						)

						return sendJson(res, { success: true, key, value })
					}

					// POST /analyze-text - Analyze if text content comes from a dynamic expression
					if (req.method === "POST" && endpoint === "/analyze-text") {
						const body = await parseBody(req)
						const { text, filePath } = body

						if (!text || !filePath) {
							return sendJson(
								res,
								{
									success: false,
									error: "text and filePath are required",
								},
								400,
							)
						}

						const fullPath = path.resolve(process.cwd(), filePath)

						if (!fs.existsSync(fullPath)) {
							return sendJson(
								res,
								{
									success: false,
									error: `File not found: ${filePath}`,
								},
								404,
							)
						}

						const fileContent = fs.readFileSync(fullPath, "utf-8")

						// Extract template section
						const templateMatch = fileContent.match(
							/<template>([\s\S]*?)<\/template>/,
						)
						if (!templateMatch) {
							return sendJson(res, {
								success: true,
								isDynamic: false,
								reason: "No template section found",
							})
						}

						const template = templateMatch[1]
						const result = {
							isDynamic: false,
							expressionType: null,
							expression: null,
							sourceKey: null,
						}

						// Check if the exact text appears as static content (not in an expression)
						// Static text would appear as >text< without {{ }}
						const staticTextPattern = new RegExp(
							`>\\s*${escapeRegex(text)}\\s*<`,
							"g",
						)
						const hasStaticText = staticTextPattern.test(template)

						// Check for template expressions {{ ... }} that might produce this text
						// We look for expressions in the template and check if the text could come from them
						const expressionPattern = /\{\{\s*([^}]+)\s*\}\}/g
						const expressions = []
						let match

						while ((match = expressionPattern.exec(template)) !== null) {
							expressions.push({
								full: match[0],
								expression: match[1].trim(),
								index: match.index,
							})
						}

						// Extract script setup section to find variable definitions
						const scriptSetupMatch = fileContent.match(
							/<script\s+setup[^>]*>([\s\S]*?)<\/script>/,
						)
						const scriptMatch = fileContent.match(
							/<script(?!\s+setup)[^>]*>([\s\S]*?)<\/script>/,
						)
						const scriptContent =
							scriptSetupMatch?.[1] || scriptMatch?.[1] || ""

						// Check for getString calls that might produce this text
						// Pattern: gxpStore.getString('key') or getString('key')
						const getStringPattern =
							/(?:gxpStore\.)?getString\s*\(\s*['"]([^'"]+)['"]/g
						const getStringCalls = []

						while ((match = getStringPattern.exec(fileContent)) !== null) {
							getStringCalls.push({
								key: match[1],
								full: match[0],
							})
						}

						// Check manifest for getString keys that match this text
						const manifestPath = path.join(process.cwd(), "app-manifest.json")
						let manifestStrings = {}
						if (fs.existsSync(manifestPath)) {
							try {
								const manifest = JSON.parse(
									fs.readFileSync(manifestPath, "utf-8"),
								)
								manifestStrings = manifest.strings?.default || {}
							} catch (e) {
								// Ignore parse errors
							}
						}

						// Check if any getString call's value matches the text
						for (const call of getStringCalls) {
							if (manifestStrings[call.key] === text) {
								result.isDynamic = true
								result.expressionType = "getString"
								result.expression = `getString('${call.key}')`
								result.sourceKey = call.key
								break
							}
						}

						// If not a getString match, check if text appears inside a template expression context
						// This is a heuristic: if the text does NOT appear as static content but we have expressions,
						// it's likely dynamic
						if (!result.isDynamic && !hasStaticText && expressions.length > 0) {
							// Check each expression to see if it could produce this text
							for (const expr of expressions) {
								// Check if expression references a variable that might contain this text
								// Look for the variable in script content
								const varName = expr.expression
									.split(".")[0]
									.split("(")[0]
									.trim()

								// Check for ref/reactive definitions
								const refPattern = new RegExp(
									`(?:const|let|var)\\s+${varName}\\s*=\\s*(?:ref|reactive)\\s*\\(\\s*['"]${escapeRegex(text)}['"]`,
									"g",
								)
								const constPattern = new RegExp(
									`(?:const|let|var)\\s+${varName}\\s*=\\s*['"]${escapeRegex(text)}['"]`,
									"g",
								)

								if (
									refPattern.test(scriptContent) ||
									constPattern.test(scriptContent)
								) {
									result.isDynamic = true
									result.expressionType = "variable"
									result.expression = expr.expression
									break
								}

								// Check for computed properties or store getters
								if (
									expr.expression.includes("Store") ||
									expr.expression.includes("store")
								) {
									result.isDynamic = true
									result.expressionType = "store"
									result.expression = expr.expression
									break
								}
							}
						}

						// Check for gxp-string attribute with this text - if found, it's managed by directive
						const gxpStringPattern = new RegExp(
							`gxp-string=["'][^"']+["'][^>]*>\\s*${escapeRegex(text)}\\s*<`,
							"g",
						)
						if (gxpStringPattern.test(template)) {
							result.isDynamic = true
							result.expressionType = "gxp-directive"
							result.expression = "gxp-string directive"
						}

						// Additional check: look for the text value in props/settings patterns
						const settingsPattern =
							/(?:pluginVars|settings|props)\s*\.\s*(\w+)/g
						while ((match = settingsPattern.exec(template)) !== null) {
							// Check if this setting might produce the text
							result.possibleSettings = result.possibleSettings || []
							result.possibleSettings.push(match[1])
						}

						return sendJson(res, {
							success: true,
							...result,
							hasStaticText,
							expressionCount: expressions.length,
							getStringCallsCount: getStringCalls.length,
						})
					}

					// GET /component-files - List Vue component files
					if (req.method === "GET" && endpoint === "/component-files") {
						const srcDir = path.join(process.cwd(), "src")
						const files = []

						function scanDir(dir, relativePath = "") {
							if (!fs.existsSync(dir)) return

							const entries = fs.readdirSync(dir, { withFileTypes: true })
							for (const entry of entries) {
								const entryPath = path.join(relativePath, entry.name)
								if (entry.isDirectory()) {
									scanDir(path.join(dir, entry.name), entryPath)
								} else if (entry.name.endsWith(".vue")) {
									files.push("src/" + entryPath)
								}
							}
						}

						scanDir(srcDir)

						return sendJson(res, {
							success: true,
							files,
						})
					}

					// Unknown endpoint
					return sendJson(
						res,
						{
							success: false,
							error: "Unknown endpoint",
						},
						404,
					)
				} catch (error) {
					console.error("[GxP Inspector] Error:", error)
					return sendJson(
						res,
						{
							success: false,
							error: error.message,
						},
						500,
					)
				}
			})

			console.log(
				"[GxP Inspector] API endpoints available at /__gxp-inspector/*",
			)
		},
	}
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Parse a data-gxp-loc value ("path:line:col" or "path:line:col:tag") into parts.
 * The file path itself may contain colons, so line/col/tag are taken from the end.
 * @returns {{ filePath: string, line: number, column: number, tag: string|null }|null}
 */
export function parseLoc(loc) {
	if (typeof loc !== "string") {
		return null
	}
	const parts = loc.split(":")
	let tag = null
	if (parts.length > 0 && !/^\d+$/.test(parts[parts.length - 1])) {
		tag = parts.pop()
	}
	const column = parseInt(parts.pop(), 10)
	const line = parseInt(parts.pop(), 10)
	const filePath = parts.join(":")
	if (!filePath || Number.isNaN(line) || Number.isNaN(column)) {
		return null
	}
	return { filePath, line, column, tag }
}

/**
 * Convert 1-based line/column coordinates into an absolute character offset.
 */
export function lineColToOffset(text, line, column) {
	let currentLine = 1
	let i = 0
	while (i < text.length && currentLine < line) {
		if (text[i] === "\n") {
			currentLine++
		}
		i++
	}
	return i + (column - 1)
}

/**
 * Read the opening tag that begins at (or just after) the given offset.
 * Respects quoted attribute values so `>` inside quotes does not end the tag.
 * @returns {{ start: number, end: number, text: string, tagName: string|null, selfClosing: boolean }|null}
 */
export function readOpeningTagAt(content, offset) {
	let start = offset
	if (content[start] !== "<") {
		const next = content.indexOf("<", Math.max(0, offset))
		if (next === -1) {
			return null
		}
		start = next
	}

	let i = start + 1
	let inDouble = false
	let inSingle = false
	while (i < content.length) {
		const c = content[i]
		if (inDouble) {
			if (c === '"') {
				inDouble = false
			}
		} else if (inSingle) {
			if (c === "'") {
				inSingle = false
			}
		} else if (c === '"') {
			inDouble = true
		} else if (c === "'") {
			inSingle = true
		} else if (c === ">") {
			i++
			break
		}
		i++
	}

	const end = i
	const text = content.slice(start, end)
	const selfClosing = /\/>\s*$/.test(text)
	const nameMatch = text.match(/^<\s*([a-zA-Z][a-zA-Z0-9-]*)/)
	return {
		start,
		end,
		text,
		tagName: nameMatch ? nameMatch[1] : null,
		selfClosing,
	}
}

/**
 * Apply attribute edits to an opening tag string and return the rewritten tag.
 * Supports setting class/style, setting/removing arbitrary attributes, and
 * preserves existing attribute order and quote style.
 */
export function applyTagEdits(tagText, { set = {}, remove = [] }) {
	const selfClosing = /\/>\s*$/.test(tagText)
	let inner = tagText.replace(/^</, "").replace(/\/?>\s*$/, "")
	const nameMatch = inner.match(/^\s*([a-zA-Z][a-zA-Z0-9-]*)/)
	const tagName = nameMatch ? nameMatch[1] : ""
	const rest = inner.slice(nameMatch ? nameMatch[0].length : 0)

	const attrs = []
	const attrRe =
		/([@:a-zA-Z_][a-zA-Z0-9_\-:.@]*)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
	let m
	while ((m = attrRe.exec(rest)) !== null) {
		if (!m[0].trim()) {
			continue
		}
		let value = null
		let quote = '"'
		if (m[2]) {
			if (m[4] !== undefined) {
				value = m[4]
				quote = '"'
			} else if (m[5] !== undefined) {
				value = m[5]
				quote = "'"
			} else {
				value = m[6]
				quote = '"'
			}
		}
		attrs.push({ name: m[1], value, quote })
	}

	const removeAttr = (name) => {
		const idx = attrs.findIndex((a) => a.name === name)
		if (idx >= 0) {
			attrs.splice(idx, 1)
		}
	}
	const upsertAttr = (name, value) => {
		const found = attrs.find((a) => a.name === name)
		if (found) {
			found.value = value
		} else {
			attrs.push({ name, value, quote: '"' })
		}
	}

	if (typeof set.class === "string") {
		if (set.class.trim() === "") {
			removeAttr("class")
		} else {
			upsertAttr("class", set.class)
		}
	}
	if (typeof set.style === "string") {
		if (set.style.trim() === "") {
			removeAttr("style")
		} else {
			upsertAttr("style", set.style)
		}
	}
	if (set.attrs && typeof set.attrs === "object") {
		for (const [k, v] of Object.entries(set.attrs)) {
			if (v === null) {
				removeAttr(k)
			} else {
				upsertAttr(k, String(v))
			}
		}
	}
	for (const name of remove) {
		removeAttr(name)
	}

	let out = `<${tagName}`
	for (const a of attrs) {
		if (a.value === null) {
			out += ` ${a.name}`
		} else {
			const q = a.quote || '"'
			const safe =
				q === '"'
					? a.value.replace(/"/g, "&quot;")
					: a.value.replace(/'/g, "&#39;")
			out += ` ${a.name}=${q}${safe}${q}`
		}
	}
	out += selfClosing ? " />" : ">"
	return out
}

/**
 * Replace the leaf text node directly following an opening tag (text up to the
 * next `<`). Surrounding whitespace is preserved. Only intended for elements
 * whose content is a single text node.
 * @returns {{ content: string, applied: boolean }}
 */
export function replaceLeafText(content, fromOffset, newText) {
	const nextLt = content.indexOf("<", fromOffset)
	if (nextLt === -1) {
		return { content, applied: false }
	}
	const segment = content.slice(fromOffset, nextLt)
	const lead = segment.match(/^\s*/)[0]
	const trail = segment.match(/\s*$/)[0]
	const safeText = String(newText).replace(/</g, "&lt;").replace(/>/g, "&gt;")
	const updated =
		content.slice(0, fromOffset) +
		lead +
		safeText +
		trail +
		content.slice(nextLt)
	return { content: updated, applied: true }
}

export default gxpInspectorPlugin
