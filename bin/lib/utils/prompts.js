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

module.exports = {
	promptUser,
	confirmPrompt,
	selectPrompt,
};
