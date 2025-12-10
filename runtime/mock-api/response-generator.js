/**
 * Response Generator
 *
 * Generates fake JSON data from OpenAPI/JSON Schema definitions
 * using Faker.js for realistic values.
 */

const { faker } = require("@faker-js/faker");

/**
 * Resolve a $ref reference in the spec
 * @param {string} ref - Reference string (e.g., "#/components/schemas/User")
 * @param {object} spec - Full OpenAPI spec
 * @returns {object|null} Resolved schema or null
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
			console.warn(`⚠️  Could not resolve $ref: ${ref}`);
			return null;
		}
	}

	return current;
}

/**
 * Generate a value for a primitive type with optional format
 * @param {string} type - JSON Schema type
 * @param {string} format - Optional format hint
 * @param {object} schema - Full schema for additional constraints
 * @returns {*} Generated value
 */
function generateValue(type, format, schema = {}) {
	// Handle enums first
	if (schema.enum && schema.enum.length > 0) {
		return faker.helpers.arrayElement(schema.enum);
	}

	// Handle examples
	if (schema.example !== undefined) {
		return schema.example;
	}

	// Handle default values
	if (schema.default !== undefined) {
		return schema.default;
	}

	switch (type) {
		case "string":
			return generateStringValue(format, schema);

		case "integer":
			return generateIntegerValue(schema);

		case "number":
			return generateNumberValue(schema);

		case "boolean":
			return faker.datatype.boolean();

		case "null":
			return null;

		default:
			return faker.lorem.word();
	}
}

/**
 * Generate a string value based on format
 * @param {string} format - String format
 * @param {object} schema - Schema with constraints
 * @returns {string} Generated string
 */
function generateStringValue(format, schema) {
	switch (format) {
		case "email":
			return faker.internet.email();

		case "uuid":
			return faker.string.uuid();

		case "uri":
		case "url":
			return faker.internet.url();

		case "hostname":
			return faker.internet.domainName();

		case "ipv4":
			return faker.internet.ipv4();

		case "ipv6":
			return faker.internet.ipv6();

		case "date":
			return faker.date.recent().toISOString().split("T")[0];

		case "date-time":
			return faker.date.recent().toISOString();

		case "time":
			return faker.date.recent().toISOString().split("T")[1].split(".")[0];

		case "password":
			return faker.internet.password();

		case "byte":
			return Buffer.from(faker.lorem.word()).toString("base64");

		case "binary":
			return faker.string.alphanumeric(32);

		case "phone":
			return faker.phone.number();

		case "color":
			return faker.color.rgb();

		default:
			// Use property name hints if available
			return generateStringByPattern(schema);
	}
}

/**
 * Generate string based on property name patterns
 * @param {object} schema - Schema with property name
 * @returns {string} Generated string
 */
function generateStringByPattern(schema) {
	const name = (schema.propertyName || "").toLowerCase();

	// Common field name patterns
	if (name.includes("name")) {
		if (name.includes("first")) return faker.person.firstName();
		if (name.includes("last")) return faker.person.lastName();
		if (name.includes("full")) return faker.person.fullName();
		if (name.includes("company")) return faker.company.name();
		return faker.person.fullName();
	}

	if (name.includes("email")) return faker.internet.email();
	if (name.includes("phone") || name.includes("mobile"))
		return faker.phone.number();
	if (name.includes("address")) return faker.location.streetAddress();
	if (name.includes("city")) return faker.location.city();
	if (name.includes("state")) return faker.location.state();
	if (name.includes("country")) return faker.location.country();
	if (name.includes("zip") || name.includes("postal"))
		return faker.location.zipCode();
	if (name.includes("url") || name.includes("link")) return faker.internet.url();
	if (name.includes("image") || name.includes("avatar") || name.includes("photo"))
		return faker.image.url();
	if (name.includes("description") || name.includes("bio"))
		return faker.lorem.paragraph();
	if (name.includes("title")) return faker.lorem.sentence();
	if (name.includes("slug")) return faker.helpers.slugify(faker.lorem.words(3));
	if (name.includes("color")) return faker.color.rgb();
	if (name.includes("token") || name.includes("key"))
		return faker.string.alphanumeric(32);

	// Apply length constraints
	const minLength = schema.minLength || 1;
	const maxLength = schema.maxLength || 50;
	const length = faker.number.int({ min: minLength, max: maxLength });

	if (schema.pattern) {
		// Can't easily generate from regex, return simple string
		return faker.string.alphanumeric(length);
	}

	return faker.lorem.words(Math.ceil(length / 6));
}

/**
 * Generate an integer value with constraints
 * @param {object} schema - Schema with constraints
 * @returns {number} Generated integer
 */
function generateIntegerValue(schema) {
	const min = schema.minimum ?? 0;
	const max = schema.maximum ?? 10000;
	const exclusiveMin = schema.exclusiveMinimum ? 1 : 0;
	const exclusiveMax = schema.exclusiveMaximum ? 1 : 0;

	return faker.number.int({
		min: min + exclusiveMin,
		max: max - exclusiveMax,
	});
}

/**
 * Generate a number value with constraints
 * @param {object} schema - Schema with constraints
 * @returns {number} Generated number
 */
function generateNumberValue(schema) {
	const min = schema.minimum ?? 0;
	const max = schema.maximum ?? 10000;

	return faker.number.float({
		min,
		max,
		fractionDigits: 2,
	});
}

/**
 * Generate data from a JSON Schema
 * @param {object} schema - JSON Schema definition
 * @param {object} spec - Full OpenAPI spec for $ref resolution
 * @param {string} propertyName - Name of the property (for hints)
 * @param {number} depth - Current recursion depth
 * @returns {*} Generated data
 */
function generateFromSchema(schema, spec = {}, propertyName = "", depth = 0) {
	// Prevent infinite recursion
	if (depth > 10) {
		return null;
	}

	// Handle null/undefined schema
	if (!schema) {
		return null;
	}

	// Handle $ref
	if (schema.$ref) {
		const resolved = resolveRef(schema.$ref, spec);
		if (resolved) {
			return generateFromSchema(resolved, spec, propertyName, depth + 1);
		}
		return null;
	}

	// Handle allOf (merge schemas)
	if (schema.allOf) {
		const merged = {};
		for (const subSchema of schema.allOf) {
			const generated = generateFromSchema(subSchema, spec, propertyName, depth + 1);
			if (generated && typeof generated === "object") {
				Object.assign(merged, generated);
			}
		}
		return merged;
	}

	// Handle oneOf/anyOf (pick first)
	if (schema.oneOf && schema.oneOf.length > 0) {
		return generateFromSchema(schema.oneOf[0], spec, propertyName, depth + 1);
	}
	if (schema.anyOf && schema.anyOf.length > 0) {
		return generateFromSchema(schema.anyOf[0], spec, propertyName, depth + 1);
	}

	// Add property name hint to schema for string generation
	const schemaWithHint = { ...schema, propertyName };

	// Handle by type
	const type = schema.type || "object";

	if (type === "object" || schema.properties) {
		return generateObject(schema, spec, depth);
	}

	if (type === "array") {
		return generateArray(schema, spec, depth);
	}

	// Primitive types
	return generateValue(type, schema.format, schemaWithHint);
}

/**
 * Generate an object from schema
 * @param {object} schema - Object schema
 * @param {object} spec - Full spec for refs
 * @param {number} depth - Recursion depth
 * @returns {object} Generated object
 */
function generateObject(schema, spec, depth) {
	const result = {};

	if (schema.properties) {
		for (const [key, propSchema] of Object.entries(schema.properties)) {
			result[key] = generateFromSchema(propSchema, spec, key, depth + 1);
		}
	}

	// Handle additionalProperties if no properties defined
	if (!schema.properties && schema.additionalProperties) {
		const count = faker.number.int({ min: 1, max: 3 });
		for (let i = 0; i < count; i++) {
			const key = faker.lorem.word();
			result[key] = generateFromSchema(
				schema.additionalProperties === true ? { type: "string" } : schema.additionalProperties,
				spec,
				key,
				depth + 1
			);
		}
	}

	return result;
}

/**
 * Generate an array from schema
 * @param {object} schema - Array schema
 * @param {object} spec - Full spec for refs
 * @param {number} depth - Recursion depth
 * @returns {array} Generated array
 */
function generateArray(schema, spec, depth) {
	const minItems = schema.minItems ?? 1;
	const maxItems = schema.maxItems ?? 5;
	const count = faker.number.int({ min: minItems, max: maxItems });

	const items = [];
	const itemSchema = schema.items || { type: "string" };

	for (let i = 0; i < count; i++) {
		items.push(generateFromSchema(itemSchema, spec, "", depth + 1));
	}

	return items;
}

/**
 * Generate a response body from an OpenAPI response schema
 * @param {object} responseSchema - Response schema from OpenAPI
 * @param {object} spec - Full OpenAPI spec
 * @returns {*} Generated response body
 */
function generateResponse(responseSchema, spec) {
	if (!responseSchema) {
		return {};
	}

	// Handle content type (prefer JSON)
	const content = responseSchema.content;
	if (content) {
		const jsonContent =
			content["application/json"] ||
			content["application/vnd.api+json"] ||
			content["*/*"];

		if (jsonContent && jsonContent.schema) {
			return generateFromSchema(jsonContent.schema, spec);
		}
	}

	// Direct schema (OpenAPI 2.0 style)
	if (responseSchema.schema) {
		return generateFromSchema(responseSchema.schema, spec);
	}

	return {};
}

/**
 * Generate an error response
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @returns {object} Error response object
 */
function generateErrorResponse(status, message) {
	return {
		error: true,
		status,
		message,
		timestamp: new Date().toISOString(),
	};
}

module.exports = {
	generateFromSchema,
	generateResponse,
	generateValue,
	generateErrorResponse,
	resolveRef,
};
