/**
 * Trigger State API mock
 *
 * The OpenAPI-generated routes return random bodies, so the trigger-state
 * endpoint is mocked by hand: state is kept per target in memory, a PATCH
 * merges per key (null removes a key, other values replace it whole), and
 * changes are relayed the way the platform broadcasts them — "state-change"
 * for the app's own page (`self`), "widget-state-change" for portal widgets.
 * `self` starts from the manifest's triggerState and widgets from its
 * widgetStates. Permissions and bindings aren't checked here.
 */

const express = require("express")
const fs = require("fs")
const path = require("path")

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const RESERVED_PREFIX = "gxp_"
const ROUTE = "/v1/projects/:teamSlug/:projectSlug/trigger-state/:target"

function readManifest(projectRoot) {
	try {
		return JSON.parse(
			fs.readFileSync(path.join(projectRoot, "app-manifest.json"), "utf8"),
		)
	} catch {
		return {}
	}
}

function unprocessable(res, message) {
	return res.status(422).json({ message, errors: { state: [message] } })
}

/**
 * @param {object} io - Socket.IO server instance
 * @param {object} options
 * @param {string} [options.projectRoot] - where app-manifest.json lives
 * @returns {express.Router}
 */
function createTriggerStateRouter(io, { projectRoot = process.cwd() } = {}) {
	const router = express.Router()
	const states = new Map()

	const initialState = (target) => {
		const manifest = readManifest(projectRoot)
		if (target === "self") {
			return { ...(manifest.triggerState ?? {}) }
		}
		if (target.startsWith("widget:")) {
			const bound = Object.values(manifest.widgetStates ?? {}).find(
				(widget) => String(widget?.id) === target.slice("widget:".length),
			)
			return { ...(bound?.state ?? {}) }
		}
		return {}
	}

	const stateFor = (target) => {
		if (!states.has(target)) {
			states.set(target, initialState(target))
		}
		return states.get(target)
	}

	router.get(ROUTE, (req, res) => {
		res.json({
			target: req.params.target,
			state: stateFor(req.params.target),
			updated_at: new Date().toISOString(),
		})
	})

	router.patch(ROUTE, express.json(), (req, res) => {
		const { target } = req.params
		const changes = req.body?.state

		if (
			!changes ||
			typeof changes !== "object" ||
			Array.isArray(changes) ||
			Object.keys(changes).length === 0
		) {
			return unprocessable(res, "The state field is required.")
		}

		const keys = Object.keys(changes)
		const badKeys = keys.filter((key) => !KEY_PATTERN.test(key))
		if (badKeys.length > 0) {
			return unprocessable(
				res,
				`Keys must be letters, digits and underscores, and not start with a digit: ${badKeys.join(", ")}.`,
			)
		}

		const reserved = keys.filter((key) => key.startsWith(RESERVED_PREFIX))
		if (reserved.length > 0) {
			return unprocessable(
				res,
				`These keys are reserved: ${reserved.join(", ")}.`,
			)
		}

		const state = stateFor(target)
		for (const [key, value] of Object.entries(changes)) {
			if (value === null) {
				delete state[key]
			} else {
				state[key] = value
			}
		}

		const updatedAt = new Date().toISOString()
		if (target.startsWith("widget:")) {
			io?.emit("widget-state-change", {
				project_portal_widget_id: Number(target.slice("widget:".length)),
				changes,
				updated_at: updatedAt,
			})
		} else if (target === "self") {
			io?.emit("state-change", { changes, updated_at: updatedAt })
		}

		res.json({ target, state, updated_at: updatedAt })
	})

	return router
}

module.exports = { createTriggerStateRouter }
