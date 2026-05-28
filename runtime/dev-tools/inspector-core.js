/**
 * GxP In-Page Inspector Core
 *
 * A framework-agnostic DOM inspection engine that replicates the GxP browser
 * extension's inspector without needing the extension. It is injected directly
 * into the dev server page and driven by the in-page dev tools (ribbon menu +
 * editor modal).
 *
 * Responsibilities:
 *  - Hover highlighting (orange dashed overlay + ComponentName::tag::key label)
 *  - Persistent selection highlight (cyan)
 *  - Two modes:
 *      • "select" — pick an element to inspect/edit (onSelect callback)
 *      • "locate" — broadcast the element's source location (gxp:open-in-source)
 *  - Vue 3 component detection (props / setupState)
 *  - The window broadcast contract used by iframe-embedding host pages
 *
 * This module exports helpers (getVueInstance, buildElementLabel, parseLoc, …)
 * so the Vue editor modal and component tree can reuse the same logic.
 */

const HIGHLIGHT_ID = "gxp-inspector-highlight"
const SELECTION_ID = "gxp-inspector-selection"
const STYLE_ID = "gxp-inspector-style"

// ============================================================
// Vue component detection
// ============================================================

export function getVueInstance(el) {
	if (!el) {
		return null
	}
	if (el.__vueParentComponent) {
		return el.__vueParentComponent
	}
	let current = el
	while (current) {
		if (current.__vueParentComponent) {
			return current.__vueParentComponent
		}
		current = current.parentElement
	}
	return null
}

function safeSerialize(value) {
	if (value === null || value === undefined) {
		return value
	}
	if (typeof value === "function") {
		return "[Function]"
	}
	if (typeof value !== "object") {
		return value
	}
	try {
		return JSON.parse(JSON.stringify(value))
	} catch {
		if (Array.isArray(value)) {
			return `[Array(${value.length})]`
		}
		return "{…}"
	}
}

export function getComponentInfo(vueInstance) {
	if (!vueInstance) {
		return null
	}
	const type = vueInstance.type || {}
	const name =
		type.name ||
		type.__name ||
		type.__file?.split("/").pop()?.replace(".vue", "") ||
		"Anonymous"
	const file = type.__file || null

	const props = {}
	if (vueInstance.props) {
		Object.keys(vueInstance.props).forEach((key) => {
			props[key] = safeSerialize(vueInstance.props[key])
		})
	}

	const data = {}
	if (vueInstance.setupState) {
		Object.keys(vueInstance.setupState).forEach((key) => {
			const value = vueInstance.setupState[key]
			if (typeof value !== "function") {
				data[key] = safeSerialize(value)
			}
		})
	}

	return { name, file, props, data }
}

// ============================================================
// Source location helpers
// ============================================================

/**
 * Parse a data-gxp-loc value ("path:line:col" or "path:line:col:tag").
 * File paths may contain colons, so line/col/tag are read from the end.
 */
export function parseLoc(loc) {
	if (typeof loc !== "string") {
		return null
	}
	const parts = loc.split(":")
	let tag = null
	if (parts.length > 0 && !/^\d+$/.test(parts[parts.length - 1])) {
		tag = parts.pop()
	}
	const column = parseInt(parts.pop(), 10)
	const line = parseInt(parts.pop(), 10)
	const filePath = parts.join(":")
	if (!filePath || Number.isNaN(line) || Number.isNaN(column)) {
		return null
	}
	return { filePath, line, column, tag }
}

export function textToKey(text) {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+/g, "_")
		.substring(0, 40)
		.replace(/_+$/, "")
}

/**
 * Build a descriptive label: ComponentName::tag::gxp-key
 */
export function buildElementLabel(el) {
	const parts = []
	const info = getComponentInfo(getVueInstance(el))
	if (info?.name) {
		parts.push(info.name)
	}
	parts.push(el.tagName.toLowerCase())
	const stringKey = el.getAttribute?.("gxp-string")
	const srcKey = el.getAttribute?.("gxp-src")
	if (stringKey) {
		parts.push(stringKey)
	} else if (srcKey) {
		parts.push(srcKey)
	}
	return parts.join("::")
}

/**
 * Build the gxp:open-in-source payload broadcast for an element.
 */
export function buildSourcePayload(el) {
	const info = getComponentInfo(getVueInstance(el))
	let file = null
	let line = null
	let column = null
	let tag = el.tagName.toLowerCase()
	const loc = el.getAttribute?.("data-gxp-loc")
	if (loc) {
		const parsed = parseLoc(loc)
		if (parsed) {
			file = parsed.filePath
			line = parsed.line
			column = parsed.column
			if (parsed.tag) {
				tag = parsed.tag
			}
		}
	}
	return {
		type: "gxp:open-in-source",
		file,
		line,
		column,
		loc: loc || null,
		component: info?.name || null,
		tag,
		gxpKey:
			el.getAttribute?.("gxp-string") || el.getAttribute?.("gxp-src") || null,
		expr: el.getAttribute?.("data-gxp-expr") || null,
	}
}

/**
 * Broadcast an element's source location on three channels so it is reachable
 * whether the plugin runs standalone or embedded in an iframe:
 *  1. CustomEvent on window (same-document listeners)
 *  2. window.postMessage (self)
 *  3. window.parent.postMessage (iframe-embedding host page)
 *
 * @param {Element} el
 * @param {string} [targetOrigin="*"] - postMessage target origin
 */
export function broadcastSource(el, targetOrigin = "*") {
	const payload = buildSourcePayload(el)
	try {
		window.dispatchEvent(
			new CustomEvent("gxp:open-in-source", { detail: payload }),
		)
	} catch {
		/* no-op */
	}
	try {
		window.postMessage(payload, targetOrigin)
	} catch {
		/* no-op */
	}
	try {
		if (window.parent && window.parent !== window) {
			window.parent.postMessage(payload, targetOrigin)
		}
	} catch {
		/* cross-origin parent access can throw; ignore */
	}
	return payload
}

const INTERNAL_ATTRS = ["class", "style", "data-gxp-loc", "data-gxp-expr"]

/**
 * Build a fully serializable description of an element — everything the local
 * editor modal shows, so a host page can render its own editor over postMessage.
 */
export function describeElement(el) {
	if (!el) {
		return null
	}
	const base = buildSourcePayload(el)
	const info = getComponentInfo(getVueInstance(el))
	const hasElementChildren = el.children && el.children.length > 0
	const text = el.textContent ? el.textContent.trim() : ""

	const attrs = {}
	if (el.attributes) {
		for (const attr of Array.from(el.attributes)) {
			if (!INTERNAL_ATTRS.includes(attr.name)) {
				attrs[attr.name] = attr.value
			}
		}
	}

	return {
		...base,
		classes: el.getAttribute?.("class") || "",
		style: el.getAttribute?.("style") || "",
		text: hasElementChildren ? null : text,
		canEditText: !hasElementChildren && !!text,
		attrs,
		props: info?.props || {},
		state: info?.data || {},
	}
}

function instanceName(instance) {
	const type = instance?.type || {}
	return (
		type.name ||
		type.__name ||
		type.__file?.split("/").pop()?.replace(".vue", "") ||
		"Anonymous"
	)
}

function instanceEl(instance) {
	const el = instance?.vnode?.el || instance?.subTree?.el
	return el && el.nodeType === 1 ? el : null
}

function collectChildInstances(vnode, out) {
	if (!vnode) {
		return
	}
	if (Array.isArray(vnode)) {
		vnode.forEach((v) => collectChildInstances(v, out))
		return
	}
	if (vnode.component) {
		out.push(vnode.component)
		return
	}
	if (Array.isArray(vnode.children)) {
		collectChildInstances(vnode.children, out)
	}
}

/**
 * Walk the mounted Vue app and return a flat, depth-tagged component tree.
 * Each node carries the live root `el` (for in-page highlighting) and its
 * `loc` (so a cross-window host can reference it by source location).
 */
export function getComponentTree(rootEl) {
	const appEl =
		rootEl ||
		(typeof document !== "undefined" ? document.querySelector("#app") : null)
	const root = appEl?.__vue_app__?._instance
	const rows = []
	if (!root) {
		return rows
	}
	const walk = (instance, depth) => {
		const el = instanceEl(instance)
		rows.push({
			name: instanceName(instance),
			depth,
			el,
			loc: el?.getAttribute?.("data-gxp-loc") || null,
		})
		const children = []
		collectChildInstances(instance.subTree, children)
		for (const child of children) {
			walk(child, depth + 1)
		}
	}
	walk(root, 0)
	return rows
}

// ============================================================
// Overlay styling
// ============================================================

function ensureStyles() {
	if (document.getElementById(STYLE_ID)) {
		return
	}
	const style = document.createElement("style")
	style.id = STYLE_ID
	style.textContent = `
    body.gxp-inspector-active,
    body.gxp-inspector-active * { cursor: crosshair !important; }
    #${HIGHLIGHT_ID} {
      position: fixed; pointer-events: none; z-index: 2147483646; display: none;
      border: 2px dashed #f59e0b; background: rgba(245, 158, 11, 0.1);
      border-radius: 4px; box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
    }
    #${HIGHLIGHT_ID}.gxp-mode-locate {
      border-color: #61dafb; background: rgba(97, 218, 251, 0.12);
      box-shadow: 0 0 8px rgba(97, 218, 251, 0.4);
    }
    #${HIGHLIGHT_ID} .gxp-label {
      position: absolute; top: -24px; left: -2px; background: #f59e0b;
      color: #1e1e1e; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 3px 3px 0 0;
      white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis;
    }
    #${HIGHLIGHT_ID}.gxp-mode-locate .gxp-label { background: #61dafb; }
    #${SELECTION_ID} {
      position: fixed; pointer-events: none; z-index: 2147483645; display: none;
      border: 3px solid #61dafb; background: rgba(97, 218, 251, 0.1); border-radius: 4px;
      box-shadow: 0 0 0 1px rgba(97, 218, 251, 0.3), 0 0 12px 3px rgba(97, 218, 251, 0.5),
                  0 0 24px 6px rgba(97, 218, 251, 0.25), inset 0 0 20px rgba(97, 218, 251, 0.1);
      animation: gxp-selection-pulse 2s ease-in-out infinite;
    }
    #${SELECTION_ID} .gxp-label {
      position: absolute; top: -26px; left: -3px; background: #61dafb; color: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px 4px 0 0;
      white-space: nowrap; box-shadow: 0 0 10px rgba(97, 218, 251, 0.6);
      max-width: 60vw; overflow: hidden; text-overflow: ellipsis;
    }
    @keyframes gxp-selection-pulse {
      0%, 100% { box-shadow: 0 0 0 1px rgba(97, 218, 251, 0.3), 0 0 12px 3px rgba(97, 218, 251, 0.5),
                              0 0 24px 6px rgba(97, 218, 251, 0.25), inset 0 0 20px rgba(97, 218, 251, 0.1); }
      50% { box-shadow: 0 0 0 2px rgba(97, 218, 251, 0.5), 0 0 20px 5px rgba(97, 218, 251, 0.7),
                        0 0 40px 10px rgba(97, 218, 251, 0.35), inset 0 0 30px rgba(97, 218, 251, 0.15); }
    }
  `
	document.head.appendChild(style)
}

// ============================================================
// Inspector controller factory
// ============================================================

/**
 * Create an inspector controller.
 *
 * @param {object} options
 * @param {(el: Element) => void} [options.onSelect] - called in select mode on click
 * @param {(el: Element, payload: object) => void} [options.onLocate] - called in locate mode on click
 * @param {string} [options.targetOrigin="*"] - postMessage target origin for broadcasts
 */
export function createInspectorCore(options = {}) {
	const { onSelect, onLocate, targetOrigin = "*" } = options

	let mode = "off" // "off" | "select" | "locate"
	let highlightEl = null
	let selectionEl = null
	let hoveredEl = null
	let selectedEl = null

	function isOverlay(el) {
		return (
			el === highlightEl ||
			highlightEl?.contains(el) ||
			el === selectionEl ||
			selectionEl?.contains(el) ||
			el?.closest?.(".gx-devtools-modal") ||
			el?.closest?.(".gx-inspector-ribbon")
		)
	}

	function ensureOverlays() {
		ensureStyles()
		if (!highlightEl) {
			highlightEl = document.createElement("div")
			highlightEl.id = HIGHLIGHT_ID
			highlightEl.innerHTML = `<div class="gxp-label"></div>`
			document.body.appendChild(highlightEl)
		}
		if (!selectionEl) {
			selectionEl = document.createElement("div")
			selectionEl.id = SELECTION_ID
			selectionEl.innerHTML = `<div class="gxp-label"></div>`
			document.body.appendChild(selectionEl)
		}
	}

	function positionOverlay(overlay, el) {
		const rect = el.getBoundingClientRect()
		overlay.style.display = "block"
		overlay.style.left = `${rect.left}px`
		overlay.style.top = `${rect.top}px`
		overlay.style.width = `${rect.width}px`
		overlay.style.height = `${rect.height}px`
		overlay.querySelector(".gxp-label").textContent = buildElementLabel(el)
	}

	function updateHighlight(el) {
		ensureOverlays()
		highlightEl.classList.toggle("gxp-mode-locate", mode === "locate")
		positionOverlay(highlightEl, el)
	}

	function hideHighlight() {
		if (highlightEl) {
			highlightEl.style.display = "none"
		}
	}

	function showSelection(el) {
		ensureOverlays()
		selectedEl = el
		positionOverlay(selectionEl, el)
	}

	function hideSelection() {
		if (selectionEl) {
			selectionEl.style.display = "none"
		}
		selectedEl = null
	}

	function repositionSelection() {
		if (selectedEl && selectionEl && selectionEl.style.display !== "none") {
			positionOverlay(selectionEl, selectedEl)
		}
	}

	function onMouseMove(e) {
		if (mode === "off") {
			return
		}
		const el = e.target
		if (isOverlay(el)) {
			return
		}
		if (el !== hoveredEl) {
			hoveredEl = el
			updateHighlight(el)
		}
	}

	function onClick(e) {
		if (mode === "off") {
			return
		}
		const el = e.target
		if (isOverlay(el)) {
			return
		}
		e.preventDefault()
		e.stopPropagation()

		if (mode === "locate") {
			const payload = broadcastSource(el, targetOrigin)
			showSelection(el)
			hideHighlight()
			disable()
			onLocate?.(el, payload)
			return
		}

		// select mode
		showSelection(el)
		hideHighlight()
		disable()
		onSelect?.(el)
	}

	function onKeyDown(e) {
		if (e.key === "Escape" && mode !== "off") {
			disable()
		}
	}

	function enable(nextMode = "select") {
		mode = nextMode
		ensureOverlays()
		document.body.classList.add("gxp-inspector-active")
		hoveredEl = null
		document.addEventListener("mousemove", onMouseMove, true)
		document.addEventListener("click", onClick, true)
		window.addEventListener("scroll", repositionSelection, true)
		window.addEventListener("resize", repositionSelection)
		document.addEventListener("keydown", onKeyDown, true)
	}

	function disable() {
		mode = "off"
		hideHighlight()
		document.body.classList.remove("gxp-inspector-active")
		document.removeEventListener("mousemove", onMouseMove, true)
		document.removeEventListener("click", onClick, true)
		document.removeEventListener("keydown", onKeyDown, true)
		hoveredEl = null
	}

	function destroy() {
		disable()
		hideSelection()
		window.removeEventListener("scroll", repositionSelection, true)
		window.removeEventListener("resize", repositionSelection)
		highlightEl?.remove()
		selectionEl?.remove()
		highlightEl = null
		selectionEl = null
	}

	return {
		enable,
		disable,
		destroy,
		setMode: (m) => (m === "off" ? disable() : enable(m)),
		getMode: () => mode,
		isEnabled: () => mode !== "off",
		// Reused by the editor modal + component tree
		highlight: (el) => (el ? showSelection(el) : hideSelection()),
		clearSelection: hideSelection,
		repositionSelection,
		broadcast: (el) => broadcastSource(el, targetOrigin),
	}
}
