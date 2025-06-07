document.addEventListener("DOMContentLoaded", async function () {
	const toggleButton = document.getElementById("toggleButton");
	const toggleText = document.getElementById("toggleText");
	const addRuleButton = document.getElementById("addRuleButton");
	const saveButton = document.getElementById("saveButton");
	const rulesContainer = document.getElementById("rulesContainer");
	const status = document.getElementById("status");
	const maskingMode = document.getElementById("maskingMode");

	let currentState = { enabled: false, rules: [] };

	// Load current state
	try {
		const response = await browser.runtime.sendMessage({ action: "getState" });
		currentState = response;
		updateUI();
		renderRules();
	} catch (error) {
		console.error("Failed to load state:", error);
	}

	// Toggle proxy
	toggleButton.addEventListener("click", async function () {
		try {
			const response = await browser.runtime.sendMessage({
				action: "toggleProxy",
			});
			currentState.enabled = response.enabled;
			updateUI();
			showStatus("Proxy " + (response.enabled ? "enabled" : "disabled"));
		} catch (error) {
			console.error("Failed to toggle proxy:", error);
			showStatus("Error toggling proxy");
		}
	});

	// Toggle masking mode
	maskingMode.addEventListener("change", async function () {
		try {
			const response = await browser.runtime.sendMessage({
				action: "setMaskingMode",
				enabled: maskingMode.checked,
			});
			showStatus(
				maskingMode.checked ? "Masking mode enabled" : "Masking mode disabled"
			);
		} catch (error) {
			console.error("Failed to toggle masking mode:", error);
		}
	});

	// Add new rule
	addRuleButton.addEventListener("click", function () {
		currentState.rules.push({
			pattern: "",
			redirect: "",
			maskUrl: false,
		});
		renderRules();
	});

	// Save changes
	saveButton.addEventListener("click", async function () {
		try {
			// Validate rules
			const validRules = currentState.rules.filter(
				(rule) => rule.pattern.trim() !== "" && rule.redirect.trim() !== ""
			);

			// Test regex patterns
			for (const rule of validRules) {
				try {
					new RegExp(rule.pattern);
				} catch (e) {
					showStatus("Invalid regex pattern: " + rule.pattern);
					return;
				}
			}

			const response = await browser.runtime.sendMessage({
				action: "updateRules",
				rules: validRules,
			});

			if (response.success) {
				currentState.rules = validRules;
				renderRules();
				showStatus("Rules saved successfully!");
			} else {
				showStatus("Error saving rules");
			}
		} catch (error) {
			console.error("Failed to save rules:", error);
			showStatus("Error saving rules");
		}
	});

	// Update UI based on current state
	function updateUI() {
		if (currentState.enabled) {
			toggleButton.classList.add("enabled");
			toggleText.textContent = "ON";
		} else {
			toggleButton.classList.remove("enabled");
			toggleText.textContent = "OFF";
		}
	}

	// Render proxy rules
	function renderRules() {
		rulesContainer.innerHTML = "";

		if (currentState.rules.length === 0) {
			rulesContainer.innerHTML =
				'<div class="empty-state">No proxy rules configured.<br>Click "Add Rule" to get started.</div>';
			return;
		}

		currentState.rules.forEach((rule, index) => {
			const ruleDiv = document.createElement("div");
			ruleDiv.className = "rule-item";
			ruleDiv.innerHTML = `
        <div class="rule-inputs">
          <div class="input-group">
            <label class="input-label">Pattern (Regex)</label>
            <input type="text" class="pattern-input" value="${escapeHtml(
							rule.pattern
						)}" 
                   placeholder="e.g., api\\.example\\.com" data-index="${index}">
          </div>
          <div class="input-group">
            <label class="input-label">Redirect To</label>
            <input type="text" class="redirect-input" value="${escapeHtml(
							rule.redirect
						)}" 
                   placeholder="e.g., api.alternative.com" data-index="${index}">
          </div>
          <div class="input-group">
            <label style="font-size: 11px; color: #6c757d;">
              <input type="checkbox" class="mask-checkbox" ${
								rule.maskUrl ? "checked" : ""
							} data-index="${index}">
              Mask URL (transparent proxy)
            </label>
          </div>
        </div>
        <div class="rule-actions">
          <button class="delete-button" data-index="${index}">Delete</button>
        </div>
      `;
			rulesContainer.appendChild(ruleDiv);
		});

		// Attach event listeners
		attachRuleEventListeners();
	}

	// Attach event listeners to rule inputs and buttons
	function attachRuleEventListeners() {
		// Pattern inputs
		document.querySelectorAll(".pattern-input").forEach((input) => {
			input.addEventListener("input", function () {
				const index = parseInt(this.dataset.index);
				currentState.rules[index].pattern = this.value;
			});
		});

		// Redirect inputs
		document.querySelectorAll(".redirect-input").forEach((input) => {
			input.addEventListener("input", function () {
				const index = parseInt(this.dataset.index);
				currentState.rules[index].redirect = this.value;
			});
		});

		// Mask checkboxes
		document.querySelectorAll(".mask-checkbox").forEach((checkbox) => {
			checkbox.addEventListener("change", function () {
				const index = parseInt(this.dataset.index);
				currentState.rules[index].maskUrl = this.checked;
			});
		});

		// Delete buttons
		document.querySelectorAll(".delete-button").forEach((button) => {
			button.addEventListener("click", function () {
				const index = parseInt(this.dataset.index);
				currentState.rules.splice(index, 1);
				renderRules();
			});
		});
	}

	// Show status message
	function showStatus(message) {
		status.textContent = message;
		status.className = "status success";
		status.style.display = "block";

		setTimeout(() => {
			status.style.display = "none";
		}, 3000);
	}

	// Escape HTML to prevent XSS
	function escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
});
