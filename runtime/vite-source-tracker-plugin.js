/**
 * GxP Source Tracker Vite Plugin
 *
 * Transforms Vue templates at compile time to add data-gxp-expr attributes
 * to elements that contain template expressions or dynamic directives.
 *
 * This uses a more reliable approach - adding attributes directly to the
 * elements rather than using comments.
 *
 * Example transformations:
 *
 *   <span>{{ title }}</span>
 * Becomes:
 *   <span data-gxp-expr="title">{{ title }}</span>
 *
 *   <div v-html="content"></div>
 * Becomes:
 *   <div v-html="content" data-gxp-expr="v-html:content"></div>
 */

/**
 * Parse HTML tags using a state machine approach
 * This correctly handles > characters inside quoted attribute values
 */
function parseTagsFromHtml(html) {
	const tags = [];
	let i = 0;

	const VOID_ELEMENTS = new Set([
		"br", "hr", "img", "input", "meta", "link",
		"area", "base", "col", "embed", "param",
		"source", "track", "wbr"
	]);

	while (i < html.length) {
		// Look for tag start
		if (html[i] === "<") {
			const tagStart = i;
			i++;

			// Check for closing tag
			const isClosing = html[i] === "/";
			if (isClosing) i++;

			// Skip if not a valid tag start (could be < in text or comment)
			if (!/[a-zA-Z]/.test(html[i])) {
				continue;
			}

			// Parse tag name
			let tagName = "";
			while (i < html.length && /[a-zA-Z0-9-]/.test(html[i])) {
				tagName += html[i];
				i++;
			}

			// Parse attributes (skip whitespace and attributes until we hit > or />)
			let attrs = "";
			let inDoubleQuote = false;
			let inSingleQuote = false;
			let foundEnd = false;
			let isSelfClosing = false;

			while (i < html.length && !foundEnd) {
				const char = html[i];

				if (inDoubleQuote) {
					attrs += char;
					if (char === '"') {
						inDoubleQuote = false;
					}
					i++;
				} else if (inSingleQuote) {
					attrs += char;
					if (char === "'") {
						inSingleQuote = false;
					}
					i++;
				} else if (char === '"') {
					attrs += char;
					inDoubleQuote = true;
					i++;
				} else if (char === "'") {
					attrs += char;
					inSingleQuote = true;
					i++;
				} else if (char === "/" && html[i + 1] === ">") {
					isSelfClosing = true;
					i += 2;
					foundEnd = true;
				} else if (char === ">") {
					i++;
					foundEnd = true;
				} else {
					attrs += char;
					i++;
				}
			}

			if (!foundEnd) {
				// Malformed tag, skip
				continue;
			}

			const fullMatch = html.substring(tagStart, i);

			// Check for void elements
			if (!isSelfClosing && VOID_ELEMENTS.has(tagName.toLowerCase())) {
				isSelfClosing = true;
			}

			tags.push({
				tagName,
				attrs: attrs.trim(),
				start: tagStart,
				fullMatch,
				isClosing,
				isSelfClosing,
			});
		} else {
			i++;
		}
	}

	return tags;
}

/**
 * Create the source tracker plugin
 */
export function gxpSourceTrackerPlugin(options = {}) {
	const { enabled = true, attrName = "data-gxp-expr" } = options;

	return {
		name: "gxp-source-tracker",
		enforce: "pre",

		apply(config, { command }) {
			return enabled && command === "serve";
		},

		transform(code, id) {
			if (!id.endsWith(".vue")) {
				return null;
			}

			const templateMatch = code.match(/<template>([\s\S]*?)<\/template>/);
			if (!templateMatch) {
				return null;
			}

			// Debug: log which file we're processing
			const fileName = id.split("/").pop();
			console.log(`[GxP Source Tracker] Processing: ${fileName}`);

			let template = templateMatch[1];
			let modified = false;

			// Process each element that has {{ expression }} as its content
			// Strategy: Find each {{ expression }} and trace back to find its parent element

			const exprPattern = /\{\{([\s\S]*?)\}\}/g;
			let match;

			// Map to track which elements we've already added attributes to
			// Key: element start position, Value: array of expressions
			const elementExpressions = new Map();

			while ((match = exprPattern.exec(template)) !== null) {
				const exprStart = match.index;
				const expression = match[1].trim();

				// Find the opening tag that contains this expression
				// Look backwards from the expression to find the nearest unclosed tag
				const beforeExpr = template.substring(0, exprStart);

				// Use state-machine parser for reliable tag parsing
				const tags = parseTagsFromHtml(beforeExpr);

				// Walk through tags to find the immediate parent (last unclosed tag)
				const stack = [];
				for (const tag of tags) {
					if (tag.isSelfClosing) continue;

					if (tag.isClosing) {
						// Pop from stack
						if (
							stack.length > 0 &&
							stack[stack.length - 1].tagName.toLowerCase() ===
								tag.tagName.toLowerCase()
						) {
							stack.pop();
						}
					} else {
						stack.push(tag);
					}
				}

				// The last item in the stack is our parent element
				if (stack.length > 0) {
					const parentTagInfo = stack[stack.length - 1];

					// Skip script/style tags
					if (
						["script", "style"].includes(parentTagInfo.tagName.toLowerCase())
					) {
						continue;
					}

					// Skip if already has data-gxp-expr in the original attrs
					if (parentTagInfo.attrs.includes(attrName)) {
						continue;
					}

					// Add this expression to the parent element's list
					const key = parentTagInfo.start;
					if (!elementExpressions.has(key)) {
						elementExpressions.set(key, {
							tagInfo: parentTagInfo,
							expressions: [],
						});
					}
					elementExpressions.get(key).expressions.push(expression);
				}
			}

			// Now build replacements for each element that has expressions
			const replacements = [];

			for (const [start, data] of elementExpressions) {
				const { tagInfo, expressions } = data;

				// Only add expressions that are direct children (not from nested elements)
				// For now, take all unique expressions
				const uniqueExprs = [...new Set(expressions)];
				const exprValue = uniqueExprs.join("; ");

				const oldOpenTag = tagInfo.fullMatch;
				// Insert the attribute before the closing > or />
				let newOpenTag;
				if (oldOpenTag.endsWith("/>")) {
					newOpenTag = oldOpenTag.slice(0, -2) + ` ${attrName}="${escapeAttr(exprValue)}"/>`;
				} else {
					newOpenTag = oldOpenTag.slice(0, -1) + ` ${attrName}="${escapeAttr(exprValue)}">`;
				}

				replacements.push({
					start: tagInfo.start,
					oldText: oldOpenTag,
					newText: newOpenTag,
				});

				modified = true;
			}

			// Apply replacements in reverse order to preserve indices
			replacements.sort((a, b) => b.start - a.start);
			for (const r of replacements) {
				template =
					template.substring(0, r.start) +
					r.newText +
					template.substring(r.start + r.oldText.length);
			}

			// Also handle v-html, v-text directives using state-machine approach
			template = addAttrToDirective(template, "v-html", attrName);
			template = addAttrToDirective(template, "v-text", attrName);
			template = addAttrToDirective(template, ":textContent", attrName);

			if (!modified && !template.includes(attrName)) {
				console.log(
					`[GxP Source Tracker] No expressions found in: ${fileName}`
				);
				return null;
			}

			console.log(
				`[GxP Source Tracker] Added data-gxp-expr to ${elementExpressions.size} elements in: ${fileName}`
			);
			const newCode = code.replace(
				/<template>[\s\S]*?<\/template>/,
				`<template>${template}</template>`
			);

			return {
				code: newCode,
				map: null,
			};
		},
	};
}

/**
 * Add data-gxp-expr attribute to elements with a specific directive
 */
function addAttrToDirective(template, directive, attrName) {
	const tags = parseTagsFromHtml(template);
	const replacements = [];

	for (const tag of tags) {
		if (tag.isClosing) continue;
		if (tag.fullMatch.includes(attrName)) continue;

		// Check if this tag has the directive
		const directivePattern = new RegExp(`${escapeRegex(directive)}="([^"]*)"`, "g");
		const match = directivePattern.exec(tag.attrs);
		if (match) {
			const exprValue = `${directive}:${match[1]}`;
			let newOpenTag;
			if (tag.fullMatch.endsWith("/>")) {
				newOpenTag = tag.fullMatch.slice(0, -2) + ` ${attrName}="${escapeAttr(exprValue)}"/>`;
			} else {
				newOpenTag = tag.fullMatch.slice(0, -1) + ` ${attrName}="${escapeAttr(exprValue)}">`;
			}

			replacements.push({
				start: tag.start,
				oldText: tag.fullMatch,
				newText: newOpenTag,
			});
		}
	}

	// Apply replacements in reverse order
	replacements.sort((a, b) => b.start - a.start);
	for (const r of replacements) {
		template =
			template.substring(0, r.start) +
			r.newText +
			template.substring(r.start + r.oldText.length);
	}

	return template;
}

function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttr(str) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

export default gxpSourceTrackerPlugin;
