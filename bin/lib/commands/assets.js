/**
 * Assets Command
 *
 * Manages development assets and placeholder image generation.
 */

const path = require("path");
const fs = require("fs");
const shell = require("shelljs");
const {
	findProjectRoot,
	resolveGxPaths,
	safeCopyFile,
	isImageMagickInstalled,
	ensureImageMagickInstalled,
} = require("../utils");

/**
 * Assets management command - manages development assets and placeholder generation
 */
async function assetsCommand(argv) {
	const action = argv.action;

	if (action === "list") {
		listDevelopmentAssets(argv);
	} else if (action === "generate") {
		await generatePlaceholderImage(argv);
	} else if (action === "init") {
		await initDevelopmentAssets();
	} else {
		console.error(
			"❌ Invalid assets action. Use 'list', 'generate', or 'init'"
		);
		process.exit(1);
	}
}

function listDevelopmentAssets(argv) {
	const projectPath = findProjectRoot();
	const devAssetsDir = path.join(projectPath, "dev-assets");

	if (!fs.existsSync(devAssetsDir)) {
		console.log("❌ No dev-assets directory found");
		console.log("💡 Run 'gxtk assets init' to set up development assets");
		return;
	}
	const finalPort = argv.port || process.env.NODE_PORT || 3000;

	console.log("📁 Development Assets:");
	console.log("");

	const dirs = ["images", "videos"];
	dirs.forEach((dir) => {
		const dirPath = path.join(devAssetsDir, dir);
		if (fs.existsSync(dirPath)) {
			const files = fs.readdirSync(dirPath);
			if (files.length > 0) {
				console.log(`📸 ${dir}/`);
				files.forEach((file) => {
					const stats = fs.statSync(path.join(dirPath, file));
					const size = (stats.size / 1024).toFixed(1);
					console.log(`   • ${file} (${size} KB)`);
					console.log(
						`     URL: https://localhost:${finalPort}/dev-assets/${dir}/${file}`
					);
				});
				console.log("");
			}
		}
	});

	console.log("💡 Usage:");
	console.log("   Add assets to your store:");
	console.log(
		`   gxpStore.updateAsset("my_image", "https://localhost:${finalPort}/dev-assets/images/my-image.jpg")`
	);
}

async function generatePlaceholderImage(argv) {
	if (!ensureImageMagickInstalled()) {
		process.exit(1);
	}

	const projectPath = findProjectRoot();
	const size = argv.size || "400x300";
	const name = argv.name || "placeholder";
	const format = argv.format || "png";
	const count = Math.max(1, argv.count || 1);

	const devAssetsDir = path.join(projectPath, "dev-assets", "images");
	if (!fs.existsSync(devAssetsDir)) {
		fs.mkdirSync(devAssetsDir, { recursive: true });
	}

	// Use magick command (ImageMagick 7) or convert (ImageMagick 6)
	const magickCmd = shell.which("magick") ? "magick" : "convert";
	const finalPort = argv.port || process.env.NODE_PORT || 3000;

	const generatedAssets = [];

	console.log(`🎨 Generating ${count} placeholder${count > 1 ? "s" : ""}...`);
	console.log(`📐 Size: ${size}`);

	for (let i = 0; i < count; i++) {
		const color = argv.color || getRandomColor();
		const style = getRandomStyle();
		const suffix = count > 1 ? `-${i + 1}` : "";
		const filename = `${name}${suffix}.${format}`;
		const text =
			argv.text ||
			(count > 1 ? `${name} ${i + 1}\n${size}` : `${name}\n${size}`);
		const outputPath = path.join(devAssetsDir, filename);

		// Create command with style variations
		const styleOptions = getStyleOptions(style, color);
		const command = `${magickCmd} -size ${size} ${styleOptions.background} -gravity center ${styleOptions.text} -annotate +0+0 "${text}" "${outputPath}"`;

		console.log(`🎨 Generating: ${filename} (${color}, ${style.name})`);

		const result = shell.exec(command, { silent: true });

		if (result.code === 0) {
			console.log(`✅ Generated: ${filename}`);
			generatedAssets.push({
				name: count > 1 ? `${name}_${i + 1}` : name,
				filename,
				url: `https://localhost:${finalPort}/dev-assets/images/${filename}`,
				color,
				style: style.name,
			});
		} else {
			console.error(`❌ Failed to generate ${filename}: ${result.stderr}`);
			process.exit(1);
		}
	}

	console.log("");
	console.log("📁 Generated assets:");
	generatedAssets.forEach((asset) => {
		console.log(`   • ${asset.filename} (${asset.color}, ${asset.style})`);
		console.log(`     URL: ${asset.url}`);
	});

	console.log("");
	console.log("💡 Add to your store:");
	generatedAssets.forEach((asset) => {
		console.log(`   gxpStore.updateAsset("${asset.name}", "${asset.url}")`);
	});
}

function getRandomColor() {
	const colors = [
		"#FF6B6B",
		"#4ECDC4",
		"#45B7D1",
		"#96CEB4",
		"#FFEAA7",
		"#DDA0DD",
		"#98D8C8",
		"#F7DC6F",
		"#BB8FCE",
		"#85C1E9",
	];
	return colors[Math.floor(Math.random() * colors.length)];
}

function getRandomStyle() {
	const styles = [
		{
			name: "solid",
			description: "Solid background with white text",
		},
		{
			name: "bright",
			description: "Bright background with contrasting text",
		},
		{
			name: "outline",
			description: "Solid background with outlined text",
		},
		{
			name: "shadow",
			description: "Solid background with shadowed text",
		},
		{
			name: "minimal",
			description: "Clean minimal style with dark text",
		},
	];
	return styles[Math.floor(Math.random() * styles.length)];
}

function getStyleOptions(style, color) {
	const darkerColor = adjustColor(color, -30);
	const lighterColor = adjustColor(color, 30);

	switch (style.name) {
		case "bright":
			return {
				background: `"xc:${lighterColor}"`,
				text: `-pointsize 24 -fill "${darkerColor}"`,
			};
		case "outline":
			return {
				background: `"xc:${color}"`,
				text: `-pointsize 24 -fill none -stroke white -strokewidth 2`,
			};
		case "shadow":
			return {
				background: `"xc:${color}"`,
				text: `-pointsize 24 -fill white -stroke black -strokewidth 1`,
			};
		case "minimal":
			return {
				background: `"xc:${lighterColor}"`,
				text: `-pointsize 20 -fill "${darkerColor}"`,
			};
		default: // solid
			return {
				background: `"xc:${color}"`,
				text: `-pointsize 24 -fill white`,
			};
	}
}

function adjustColor(hex, percent) {
	// Remove # if present
	hex = hex.replace("#", "");

	// Ensure we have a valid 6-character hex
	if (hex.length !== 6) {
		console.error(`Invalid hex color: ${hex}`);
		return "#000000";
	}

	// Parse RGB values
	const r = parseInt(hex.substr(0, 2), 16);
	const g = parseInt(hex.substr(2, 2), 16);
	const b = parseInt(hex.substr(4, 2), 16);

	// Check for NaN values
	if (isNaN(r) || isNaN(g) || isNaN(b)) {
		console.error(`Failed to parse hex color: ${hex}`);
		return "#000000";
	}

	// Adjust brightness
	const adjustValue = (value, percent) => {
		const adjusted = value + (percent * 255) / 100;
		return Math.max(0, Math.min(255, Math.round(adjusted)));
	};

	const newR = adjustValue(r, percent);
	const newG = adjustValue(g, percent);
	const newB = adjustValue(b, percent);

	// Convert back to hex
	const toHex = (value) => value.toString(16).padStart(2, "0");
	return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

async function initDevelopmentAssets() {
	const projectPath = findProjectRoot();
	const devAssetsDir = path.join(projectPath, "dev-assets");

	console.log("🎨 Setting up development assets...");

	// Create directories
	const dirs = ["images", "videos"];
	dirs.forEach((dir) => {
		const dirPath = path.join(devAssetsDir, dir);
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
			console.log(`✓ Created ${dir}/ directory`);
		}
	});

	// Copy starter assets from toolkit
	const paths = resolveGxPaths();
	const sourceAssetsDir = path.join(paths.templateDir, "dev-assets");

	if (fs.existsSync(sourceAssetsDir)) {
		console.log("📋 Copying starter assets...");

		// Copy image assets
		const sourceImagesDir = path.join(sourceAssetsDir, "images");
		const destImagesDir = path.join(devAssetsDir, "images");

		if (fs.existsSync(sourceImagesDir)) {
			const imageFiles = fs.readdirSync(sourceImagesDir);
			imageFiles.forEach((file) => {
				const srcPath = path.join(sourceImagesDir, file);
				const destPath = path.join(destImagesDir, file);
				if (!fs.existsSync(destPath)) {
					safeCopyFile(srcPath, destPath, `Asset: ${file}`);
				}
			});
		}
	}

	// Add to .gitignore
	const gitignorePath = path.join(projectPath, ".gitignore");
	if (fs.existsSync(gitignorePath)) {
		let gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
		if (!gitignoreContent.includes("dev-assets/")) {
			gitignoreContent +=
				"\n# Development assets (add your own files here)\ndev-assets/\n";
			fs.writeFileSync(gitignorePath, gitignoreContent);
			console.log("✓ Added dev-assets/ to .gitignore");
		}
	}

	console.log("✅ Development assets setup complete!");
	console.log("");
	console.log("📁 Directory structure:");
	console.log("   dev-assets/");
	console.log("   ├── images/     # Image placeholders");
	console.log("   └── videos/     # Video placeholders");
	console.log("");
	console.log("💡 Commands:");
	console.log(
		"   gxtk assets list                           # List all assets"
	);
	console.log(
		"   gxtk assets generate --size 800x600       # Generate placeholder"
	);
	console.log(
		"   gxtk assets generate --name logo --size 200x200  # Custom placeholder"
	);
	console.log(
		"   gxtk assets generate --name banner --count 5    # Generate 5 variants"
	);
}

module.exports = {
	assetsCommand,
};
