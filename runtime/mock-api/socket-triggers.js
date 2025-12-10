/**
 * Socket Triggers
 *
 * Parses AsyncAPI specs for x-triggered-by extensions and emits
 * Socket.IO events after matching API calls complete.
 */

/**
 * Parse AsyncAPI spec for socket triggers
 * @param {object} asyncApiSpec - AsyncAPI specification
 * @returns {object} Map of operation keys to trigger definitions
 */
function parseSocketTriggers(asyncApiSpec) {
	const triggers = {};

	if (!asyncApiSpec) {
		return triggers;
	}

	// Handle AsyncAPI 2.x format
	if (asyncApiSpec.channels) {
		parseChannels(asyncApiSpec.channels, asyncApiSpec, triggers);
	}

	// Handle AsyncAPI 3.x format
	if (asyncApiSpec.operations) {
		parseOperations(asyncApiSpec.operations, asyncApiSpec, triggers);
	}

	// Also check components/messages directly
	if (asyncApiSpec.components?.messages) {
		parseMessages(asyncApiSpec.components.messages, triggers);
	}

	const triggerCount = Object.keys(triggers).length;
	if (triggerCount > 0) {
		console.log(`📡 Parsed ${triggerCount} socket trigger definitions`);
	}

	return triggers;
}

/**
 * Parse channels (AsyncAPI 2.x)
 * @param {object} channels - Channels object
 * @param {object} spec - Full spec
 * @param {object} triggers - Triggers map to populate
 */
function parseChannels(channels, spec, triggers) {
	for (const [channelName, channel] of Object.entries(channels)) {
		// Check publish/subscribe operations
		const operations = [
			channel.publish,
			channel.subscribe,
		].filter(Boolean);

		for (const operation of operations) {
			const message = operation.message;
			if (message) {
				extractTriggersFromMessage(channelName, message, spec, triggers);
			}
		}
	}
}

/**
 * Parse operations (AsyncAPI 3.x)
 * @param {object} operations - Operations object
 * @param {object} spec - Full spec
 * @param {object} triggers - Triggers map to populate
 */
function parseOperations(operations, spec, triggers) {
	for (const [, operation] of Object.entries(operations)) {
		if (operation.messages) {
			for (const message of operation.messages) {
				const channelName = operation.channel?.$ref || "default";
				extractTriggersFromMessage(channelName, message, spec, triggers);
			}
		}
	}
}

/**
 * Parse messages directly from components
 * @param {object} messages - Messages object
 * @param {object} triggers - Triggers map to populate
 */
function parseMessages(messages, triggers) {
	for (const [messageName, message] of Object.entries(messages)) {
		if (message["x-triggered-by"]) {
			const triggerDefs = Array.isArray(message["x-triggered-by"])
				? message["x-triggered-by"]
				: [message["x-triggered-by"]];

			for (const triggerDef of triggerDefs) {
				const operationKey = triggerDef.operation;
				if (!operationKey) continue;

				if (!triggers[operationKey]) {
					triggers[operationKey] = [];
				}

				triggers[operationKey].push({
					event: message.name || messageName,
					channel: triggerDef.channel,
					delay: triggerDef.delay || 0,
					condition: triggerDef.condition,
					payload: triggerDef.payload || message.payload,
				});
			}
		}
	}
}

/**
 * Extract triggers from a message definition
 * @param {string} channelName - Channel name
 * @param {object} message - Message object
 * @param {object} spec - Full spec for $ref resolution
 * @param {object} triggers - Triggers map to populate
 */
function extractTriggersFromMessage(channelName, message, spec, triggers) {
	// Resolve $ref if needed
	let resolvedMessage = message;
	if (message.$ref) {
		resolvedMessage = resolveRef(message.$ref, spec) || message;
	}

	// Check for x-triggered-by extension
	const triggerDefs = resolvedMessage["x-triggered-by"];
	if (!triggerDefs) return;

	const triggerArray = Array.isArray(triggerDefs) ? triggerDefs : [triggerDefs];

	for (const triggerDef of triggerArray) {
		const operationKey = triggerDef.operation;
		if (!operationKey) continue;

		if (!triggers[operationKey]) {
			triggers[operationKey] = [];
		}

		triggers[operationKey].push({
			event: resolvedMessage.name || resolvedMessage.messageId || "unknown",
			channel: triggerDef.channel || channelName,
			delay: triggerDef.delay || 0,
			condition: triggerDef.condition,
			payload: triggerDef.payload || resolvedMessage.payload,
		});
	}
}

/**
 * Resolve a $ref reference
 * @param {string} ref - Reference string
 * @param {object} spec - Full spec
 * @returns {object|null} Resolved object
 */
function resolveRef(ref, spec) {
	if (!ref || !ref.startsWith("#/")) {
		return null;
	}

	const parts = ref.slice(2).split("/");
	let current = spec;

	for (const part of parts) {
		if (current && typeof current === "object" && part in current) {
			current = current[part];
		} else {
			return null;
		}
	}

	return current;
}

/**
 * Template a payload with request/response data
 * @param {object} payload - Payload template
 * @param {object} context - Context with request and response data
 * @returns {object} Templated payload
 */
function templatePayload(payload, context) {
	if (!payload) return {};

	const payloadStr = JSON.stringify(payload);

	// Replace template variables
	const templated = payloadStr.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
		const value = resolvePath(path.trim(), context);

		if (value === undefined) {
			return match; // Keep original if not found
		}

		// Handle different types
		if (typeof value === "string") {
			return value;
		}

		return JSON.stringify(value);
	});

	try {
		return JSON.parse(templated);
	} catch {
		// If JSON parse fails, return original
		return payload;
	}
}

/**
 * Resolve a dot-notation path in an object
 * @param {string} path - Dot-notation path (e.g., "response.body.id")
 * @param {object} obj - Object to resolve in
 * @returns {*} Resolved value
 */
function resolvePath(path, obj) {
	// Handle special values
	if (path === "now") {
		return new Date().toISOString();
	}

	if (path === "timestamp") {
		return Date.now();
	}

	const parts = path.split(".");
	let current = obj;

	for (const part of parts) {
		if (current && typeof current === "object" && part in current) {
			current = current[part];
		} else {
			return undefined;
		}
	}

	return current;
}

/**
 * Evaluate a condition expression
 * @param {string} condition - Condition expression
 * @param {object} context - Context with request and response data
 * @returns {boolean} Condition result
 */
function evaluateCondition(condition, context) {
	if (!condition) return true;

	try {
		// Simple condition parsing (e.g., "response.status == 200")
		const match = condition.match(/^([^\s]+)\s*(==|!=|>|<|>=|<=)\s*(.+)$/);

		if (!match) return true;

		const [, path, operator, valueStr] = match;
		const actualValue = resolvePath(path, context);

		// Parse the expected value
		let expectedValue;
		try {
			expectedValue = JSON.parse(valueStr);
		} catch {
			expectedValue = valueStr;
		}

		switch (operator) {
			case "==":
				return actualValue == expectedValue;
			case "!=":
				return actualValue != expectedValue;
			case ">":
				return actualValue > expectedValue;
			case "<":
				return actualValue < expectedValue;
			case ">=":
				return actualValue >= expectedValue;
			case "<=":
				return actualValue <= expectedValue;
			default:
				return true;
		}
	} catch {
		return true;
	}
}

/**
 * Trigger socket events for a completed API operation
 * @param {object} io - Socket.IO server instance
 * @param {object} socketTriggers - Parsed trigger definitions
 * @param {string} operationKey - Operation key (e.g., "POST /events/{eventId}/checkin")
 * @param {object} context - Request/response context
 */
function triggerSocketEvents(io, socketTriggers, operationKey, context) {
	if (!io || !socketTriggers) return;

	const triggers = socketTriggers[operationKey];
	if (!triggers || triggers.length === 0) return;

	for (const trigger of triggers) {
		// Evaluate condition
		if (!evaluateCondition(trigger.condition, context)) {
			console.log(`   ⏭️  Skipped socket event (condition not met): ${trigger.event}`);
			continue;
		}

		// Template the payload
		const payload = templatePayload(trigger.payload, context);

		// Template the channel name
		let channel = trigger.channel || "";
		channel = channel.replace(/\{([^}]+)\}/g, (match, path) => {
			const value = resolvePath(`request.params.${path}`, context);
			return value !== undefined ? value : match;
		});

		// Schedule the emit
		const delay = trigger.delay || 0;

		const emit = () => {
			console.log(`   📡 Emitting socket event: ${trigger.event}`);
			if (channel) {
				console.log(`      Channel: ${channel}`);
			}

			io.emit(trigger.event, payload);
		};

		if (delay > 0) {
			console.log(`   ⏱️  Scheduling socket event: ${trigger.event} (${delay}ms delay)`);
			setTimeout(emit, delay);
		} else {
			emit();
		}
	}
}

/**
 * Get trigger statistics
 * @param {object} socketTriggers - Parsed trigger definitions
 * @returns {object} Statistics
 */
function getTriggerStats(socketTriggers) {
	if (!socketTriggers) {
		return { total: 0, operations: [] };
	}

	const operations = [];
	let total = 0;

	for (const [operation, triggers] of Object.entries(socketTriggers)) {
		total += triggers.length;
		operations.push({
			operation,
			events: triggers.map((t) => t.event),
		});
	}

	return { total, operations };
}

module.exports = {
	parseSocketTriggers,
	triggerSocketEvents,
	templatePayload,
	evaluateCondition,
	getTriggerStats,
};
