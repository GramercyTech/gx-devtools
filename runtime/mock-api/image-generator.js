/**
 * Image Generator
 *
 * Generates placeholder images as SVG (no external dependencies).
 * Supports configurable colors, text overlays, and formats.
 */

/**
 * Generate a random hex color
 * @returns {string} Hex color
 */
function randomColor() {
	const colors = [
		"#3498db", // Blue
		"#2ecc71", // Green
		"#e74c3c", // Red
		"#9b59b6", // Purple
		"#f39c12", // Orange
		"#1abc9c", // Teal
		"#34495e", // Dark gray
		"#e91e63", // Pink
		"#00bcd4", // Cyan
		"#ff5722", // Deep orange
	];

	return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Get contrasting text color for a background
 * @param {string} hexColor - Background color
 * @returns {string} Text color (black or white)
 */
function getContrastColor(hexColor) {
	// Remove # if present
	const hex = hexColor.replace("#", "");

	// Convert to RGB
	const r = parseInt(hex.substr(0, 2), 16);
	const g = parseInt(hex.substr(2, 2), 16);
	const b = parseInt(hex.substr(4, 2), 16);

	// Calculate luminance
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	return luminance > 0.5 ? "#000000" : "#ffffff";
}

/**
 * Validate and parse hex color
 * @param {string} color - Color input
 * @returns {string} Valid hex color
 */
function parseColor(color) {
	if (!color) return randomColor();

	// Remove # if present
	let hex = color.replace("#", "");

	// Expand 3-digit hex
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((c) => c + c)
			.join("");
	}

	// Validate
	if (/^[0-9a-fA-F]{6}$/.test(hex)) {
		return `#${hex}`;
	}

	return randomColor();
}

/**
 * Generate SVG placeholder image
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {object} options - Options
 * @param {string} options.color - Background color
 * @param {string} options.text - Text to display
 * @param {string} options.textColor - Text color (auto if not specified)
 * @param {number} options.fontSize - Font size (auto-calculated if not specified)
 * @returns {string} SVG string
 */
function generateSvg(width, height, options = {}) {
	const bgColor = parseColor(options.color);
	const textColor = options.textColor || getContrastColor(bgColor);
	const text = options.text || `${width}×${height}`;

	// Calculate font size based on dimensions
	const minDim = Math.min(width, height);
	const fontSize = options.fontSize || Math.max(12, Math.floor(minDim / 8));

	// Calculate text position
	const textX = width / 2;
	const textY = height / 2;

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <text
    x="${textX}"
    y="${textY}"
    font-family="Arial, sans-serif"
    font-size="${fontSize}"
    fill="${textColor}"
    text-anchor="middle"
    dominant-baseline="middle"
  >${escapeXml(text)}</text>
</svg>`;
}

/**
 * Escape XML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeXml(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Parse dimension string (e.g., "400x300", "400", "400:300")
 * @param {string} dimStr - Dimension string
 * @returns {object} { width, height }
 */
function parseDimensions(dimStr) {
	if (!dimStr) {
		return { width: 400, height: 300 };
	}

	// Try width x height format
	const match = dimStr.match(/^(\d+)[x×:](\d+)$/i);
	if (match) {
		return {
			width: parseInt(match[1], 10),
			height: parseInt(match[2], 10),
		};
	}

	// Single number = square
	const single = parseInt(dimStr, 10);
	if (!isNaN(single)) {
		return { width: single, height: single };
	}

	return { width: 400, height: 300 };
}

/**
 * Express route handler for image generation
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
function imageHandler(req, res) {
	// Parse dimensions from URL
	const { width: widthParam, height: heightParam } = req.params;

	let width, height;

	if (heightParam) {
		// /image/:width/:height format
		width = parseInt(widthParam, 10) || 400;
		height = parseInt(heightParam, 10) || 300;
	} else {
		// /image/:dimensions format (e.g., 400x300)
		const dims = parseDimensions(widthParam);
		width = dims.width;
		height = dims.height;
	}

	// Clamp dimensions
	width = Math.min(Math.max(width, 1), 4000);
	height = Math.min(Math.max(height, 1), 4000);

	// Parse options from query string
	const options = {
		color: req.query.color || req.query.bg,
		text: req.query.text,
		textColor: req.query.textColor || req.query.fg,
		fontSize: req.query.fontSize ? parseInt(req.query.fontSize, 10) : undefined,
	};

	// Generate SVG
	const svg = generateSvg(width, height, options);

	// Send response
	res.set("Content-Type", "image/svg+xml");
	res.set("Cache-Control", "public, max-age=86400"); // Cache for 24 hours
	res.send(svg);
}

/**
 * Generate a data URL for an image
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {object} options - Options
 * @returns {string} Data URL
 */
function generateDataUrl(width, height, options = {}) {
	const svg = generateSvg(width, height, options);
	const base64 = Buffer.from(svg).toString("base64");
	return `data:image/svg+xml;base64,${base64}`;
}

module.exports = {
	generateSvg,
	imageHandler,
	parseDimensions,
	parseColor,
	generateDataUrl,
	randomColor,
	getContrastColor,
};
