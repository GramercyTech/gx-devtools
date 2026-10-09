export function getDevServerBaseUrl(env = {}) {
	const origin = env.VITE_DEV_SERVER_ORIGIN?.trim()
	if (origin) {
		const url = new URL(origin)
		if (
			!["https:", "http:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.pathname !== "/" ||
			url.search ||
			url.hash
		) {
			throw new Error(
				"DEV_SERVER_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment",
			)
		}
		return url.origin
	}
	const protocol = env.VITE_USE_HTTPS !== "false" ? "https" : "http"
	return `${protocol}://localhost:${env.VITE_NODE_PORT || "3060"}`
}
