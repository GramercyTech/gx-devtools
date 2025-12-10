/**
 * Auth Middleware
 *
 * Validates Bearer token format (not signature) for mock API requests.
 * This simulates authentication without actually verifying tokens.
 */

/**
 * Validate Bearer token format
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function authMiddleware(req, res, next) {
	const auth = req.headers.authorization;

	// Check if Authorization header exists
	if (!auth) {
		return res.status(401).json({
			error: "Unauthorized",
			message: "Missing Authorization header",
			hint: "Include 'Authorization: Bearer <token>' header",
		});
	}

	// Check Bearer token format
	if (!auth.startsWith("Bearer ")) {
		return res.status(401).json({
			error: "Unauthorized",
			message: "Invalid Authorization format",
			hint: "Use 'Bearer <token>' format",
		});
	}

	// Extract token
	const token = auth.slice(7).trim();

	// Check token is not empty
	if (!token) {
		return res.status(401).json({
			error: "Unauthorized",
			message: "Empty token",
			hint: "Provide a non-empty token after 'Bearer '",
		});
	}

	// Token format is valid, attach to request for potential use
	req.mockToken = token;

	// Continue to next middleware/handler
	next();
}

/**
 * Optional auth middleware - allows requests without auth but attaches token if present
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function optionalAuthMiddleware(req, res, next) {
	const auth = req.headers.authorization;

	if (auth && auth.startsWith("Bearer ")) {
		req.mockToken = auth.slice(7).trim();
	}

	next();
}

/**
 * Create auth middleware based on OpenAPI security requirements
 * @param {object} operation - OpenAPI operation object
 * @returns {function} Middleware function
 */
function createAuthMiddleware(operation) {
	// Check if operation has security requirements
	const security = operation.security;

	// If security is explicitly empty array, no auth required
	if (Array.isArray(security) && security.length === 0) {
		return optionalAuthMiddleware;
	}

	// If security is defined, require auth
	if (security && security.length > 0) {
		return authMiddleware;
	}

	// Default: require auth (safer default for mock API)
	return authMiddleware;
}

module.exports = {
	authMiddleware,
	optionalAuthMiddleware,
	createAuthMiddleware,
};
