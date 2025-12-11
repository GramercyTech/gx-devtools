/**
 * User Prompts Utility
 *
 * Handles interactive CLI prompts.
 */

const readline = require("readline");

/**
 * Prompts user for input
 * @param {string} question - The question to ask
 * @returns {Promise<string>} The user's answer
 */
function promptUser(question) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}

/**
 * Prompts user for yes/no confirmation
 * @param {string} question - The question to ask
 * @param {boolean} defaultYes - Whether default is yes (Y/n) or no (y/N)
 * @returns {Promise<boolean>} True if user confirmed
 */
async function confirmPrompt(question, defaultYes = true) {
	const suffix = defaultYes ? "(Y/n)" : "(y/N)";
	const answer = await promptUser(`${question} ${suffix}: `);

	if (answer === "") {
		return defaultYes;
	}

	return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

/**
 * Prompts user to select from a list of options
 * @param {string} question - The question to ask
 * @param {string[]} options - Array of options
 * @returns {Promise<number>} Index of selected option
 */
async function selectPrompt(question, options) {
	console.log(question);
	options.forEach((opt, i) => {
		console.log(`  ${i + 1}. ${opt}`);
	});

	const answer = await promptUser("Enter number: ");
	const index = parseInt(answer, 10) - 1;

	if (index >= 0 && index < options.length) {
		return index;
	}

	return 0; // Default to first option
}

/**
 * Prompts user for multi-line input (ends with empty line or Ctrl+D)
 * @param {string} question - The initial prompt
 * @param {string} hint - Hint text shown below prompt
 * @returns {Promise<string>} The multi-line input
 */
async function multiLinePrompt(question, hint = "Enter an empty line to finish") {
	const readline = require("readline");

	console.log(question);
	console.log(`  (${hint})`);
	console.log("");

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		const lines = [];

		const promptLine = () => {
			rl.question("  > ", (line) => {
				if (line === "") {
					rl.close();
					resolve(lines.join("\n").trim());
				} else {
					lines.push(line);
					promptLine();
				}
			});
		};

		promptLine();
	});
}

/**
 * Prompts user with optional default value shown
 * @param {string} question - The question to ask
 * @param {string} defaultValue - Default value if user presses enter
 * @returns {Promise<string>} The user's answer or default
 */
async function promptWithDefault(question, defaultValue = "") {
	const suffix = defaultValue ? ` [${defaultValue}]` : "";
	const answer = await promptUser(`${question}${suffix}: `);
	return answer || defaultValue;
}

/**
 * Interactive arrow-key selection prompt
 * @param {string} question - The question to ask
 * @param {Array<{label: string, value: any, description?: string}>} options - Array of options with labels and values
 * @param {number} defaultIndex - Default selected index
 * @returns {Promise<any>} The selected option's value
 */
async function arrowSelectPrompt(question, options, defaultIndex = 0) {
	return new Promise((resolve) => {
		const stdin = process.stdin;
		const stdout = process.stdout;

		let selectedIndex = defaultIndex;
		let customInput = "";
		let isCustomMode = false;

		// Check if last option is custom input
		const hasCustomOption = options.some(
			(opt) => opt.value === "__custom__" || opt.isCustomInput
		);

		const render = () => {
			// Clear previous render
			stdout.write("\x1B[?25l"); // Hide cursor

			// Move cursor up to overwrite previous options
			if (options.length > 0) {
				stdout.write(`\x1B[${options.length + 1}A`); // +1 for question line
			}

			// Clear lines
			for (let i = 0; i <= options.length; i++) {
				stdout.write("\x1B[2K\n");
			}
			stdout.write(`\x1B[${options.length + 1}A`);

			// Print question
			stdout.write(`\x1B[36m?\x1B[0m ${question}\n`);

			// Print options
			options.forEach((opt, i) => {
				const isSelected = i === selectedIndex;
				const prefix = isSelected ? "\x1B[36m❯\x1B[0m" : " ";
				const label = isSelected ? `\x1B[36m${opt.label}\x1B[0m` : opt.label;

				if (opt.isCustomInput && isSelected && isCustomMode) {
					stdout.write(`${prefix} ${opt.label}: ${customInput}█\n`);
				} else if (opt.description && !opt.isCustomInput) {
					stdout.write(`${prefix} ${label} \x1B[90m- ${opt.description}\x1B[0m\n`);
				} else {
					stdout.write(`${prefix} ${label}\n`);
				}
			});

			stdout.write("\x1B[?25h"); // Show cursor
		};

		const cleanup = () => {
			stdin.setRawMode(false);
			stdin.removeAllListeners("data");
			stdin.pause();
			// Clear the selection UI
			stdout.write(`\x1B[${options.length + 1}A`);
			for (let i = 0; i <= options.length; i++) {
				stdout.write("\x1B[2K\n");
			}
			stdout.write(`\x1B[${options.length + 1}A`);
		};

		const handleKey = (key) => {
			const currentOption = options[selectedIndex];

			// Handle Ctrl+C
			if (key === "\x03") {
				cleanup();
				process.exit(0);
			}

			// Handle Enter
			if (key === "\r" || key === "\n") {
				cleanup();

				if (currentOption.isCustomInput) {
					// Print the final selection
					stdout.write(
						`\x1B[36m?\x1B[0m ${question} \x1B[36m${customInput || currentOption.defaultValue || ""}\x1B[0m\n`
					);
					resolve(customInput || currentOption.defaultValue || "");
				} else {
					// Print the final selection
					stdout.write(
						`\x1B[36m?\x1B[0m ${question} \x1B[36m${currentOption.label}\x1B[0m\n`
					);
					resolve(currentOption.value);
				}
				return;
			}

			// In custom input mode, handle typing
			if (currentOption && currentOption.isCustomInput && isCustomMode) {
				// Backspace
				if (key === "\x7f" || key === "\b") {
					customInput = customInput.slice(0, -1);
					render();
					return;
				}

				// Escape - exit custom mode
				if (key === "\x1b" && key.length === 1) {
					isCustomMode = false;
					render();
					return;
				}

				// Regular character input (printable ASCII)
				if (key.length === 1 && key.charCodeAt(0) >= 32 && key.charCodeAt(0) < 127) {
					customInput += key;
					render();
					return;
				}
			}

			// Arrow keys (escape sequences)
			if (key === "\x1b[A" || key === "\x1bOA") {
				// Up arrow
				selectedIndex = Math.max(0, selectedIndex - 1);
				isCustomMode = options[selectedIndex]?.isCustomInput || false;
				render();
			} else if (key === "\x1b[B" || key === "\x1bOB") {
				// Down arrow
				selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
				isCustomMode = options[selectedIndex]?.isCustomInput || false;
				render();
			} else if (currentOption && currentOption.isCustomInput && !isCustomMode) {
				// Start custom input mode on any printable character
				if (key.length === 1 && key.charCodeAt(0) >= 32 && key.charCodeAt(0) < 127) {
					isCustomMode = true;
					customInput = key;
					render();
				}
			}
		};

		// Initial render with spacing
		console.log(""); // Add space before question
		stdout.write(`\x1B[36m?\x1B[0m ${question}\n`);
		options.forEach(() => console.log(""));

		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");

		let buffer = "";
		stdin.on("data", (data) => {
			buffer += data;

			// Process escape sequences
			while (buffer.length > 0) {
				// Check for escape sequences
				if (buffer.startsWith("\x1b[") || buffer.startsWith("\x1bO")) {
					if (buffer.length >= 3) {
						handleKey(buffer.slice(0, 3));
						buffer = buffer.slice(3);
					} else {
						break; // Wait for more data
					}
				} else if (buffer.startsWith("\x1b")) {
					if (buffer.length >= 2) {
						handleKey(buffer.slice(0, 1));
						buffer = buffer.slice(1);
					} else {
						break; // Wait for more data
					}
				} else {
					handleKey(buffer[0]);
					buffer = buffer.slice(1);
				}
			}
		});

		render();
	});
}

/**
 * Interactive text input with prepopulated default
 * User can accept default with Enter, or type to replace
 * @param {string} question - The question to ask
 * @param {string} defaultValue - Prepopulated default value
 * @param {string} placeholder - Placeholder text when empty
 * @returns {Promise<string>} The entered value
 */
async function inputWithDefault(question, defaultValue = "", placeholder = "") {
	return new Promise((resolve) => {
		const stdin = process.stdin;
		const stdout = process.stdout;

		let value = defaultValue;
		let cursorPos = value.length;

		const render = () => {
			stdout.write("\x1B[?25l"); // Hide cursor
			stdout.write("\r\x1B[2K"); // Clear line

			const displayValue = value || `\x1B[90m${placeholder}\x1B[0m`;
			stdout.write(`\x1B[36m?\x1B[0m ${question}: ${value ? value : displayValue}`);

			// Position cursor
			const totalLength = question.length + 4 + cursorPos; // 4 = "? " + ": "
			stdout.write(`\r\x1B[${totalLength}C`);
			stdout.write("\x1B[?25h"); // Show cursor
		};

		const cleanup = () => {
			stdin.setRawMode(false);
			stdin.removeAllListeners("data");
			stdin.pause();
		};

		console.log(""); // Add space
		render();

		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");

		stdin.on("data", (key) => {
			// Ctrl+C
			if (key === "\x03") {
				cleanup();
				process.exit(0);
			}

			// Enter
			if (key === "\r" || key === "\n") {
				cleanup();
				stdout.write("\r\x1B[2K");
				stdout.write(`\x1B[36m?\x1B[0m ${question}: \x1B[36m${value || defaultValue}\x1B[0m\n`);
				resolve(value || defaultValue);
				return;
			}

			// Backspace
			if (key === "\x7f" || key === "\b") {
				if (cursorPos > 0) {
					value = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
					cursorPos--;
				}
				render();
				return;
			}

			// Delete
			if (key === "\x1b[3~") {
				if (cursorPos < value.length) {
					value = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
				}
				render();
				return;
			}

			// Left arrow
			if (key === "\x1b[D") {
				cursorPos = Math.max(0, cursorPos - 1);
				render();
				return;
			}

			// Right arrow
			if (key === "\x1b[C") {
				cursorPos = Math.min(value.length, cursorPos + 1);
				render();
				return;
			}

			// Home
			if (key === "\x1b[H" || key === "\x01") {
				cursorPos = 0;
				render();
				return;
			}

			// End
			if (key === "\x1b[F" || key === "\x05") {
				cursorPos = value.length;
				render();
				return;
			}

			// Regular character
			if (key.length === 1 && key.charCodeAt(0) >= 32 && key.charCodeAt(0) < 127) {
				value = value.slice(0, cursorPos) + key + value.slice(cursorPos);
				cursorPos++;
				render();
			}
		});
	});
}

module.exports = {
	promptUser,
	confirmPrompt,
	selectPrompt,
	multiLinePrompt,
	promptWithDefault,
	arrowSelectPrompt,
	inputWithDefault,
};
