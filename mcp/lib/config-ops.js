/**
 * JSON-pointer operations + GxP-aware walkers used by the MCP config tools.
 *
 * Paths are RFC-6901 JSON pointers:
 *   "/additionalTabs/0/cards/1/fieldsList/2"
 * Empty or "/" means "the whole document".
 *
 * All functions are pure: they operate on a parsed doc and return either a
 * value (readers) or a new doc (writers). No file IO here.
 */

function parsePointer(pointer) {
	if (pointer === "" || pointer === "/") {
		return []
	}
	if (!pointer.startsWith("/")) {
		throw new Error(`Invalid JSON pointer (must start with "/"): ${pointer}`)
	}
	return pointer
		.slice(1)
		.split("/")
		.map((segment) =>
			decodeURIComponent(segment.replace(/~1/g, "/").replace(/~0/g, "~")),
		)
}

function encodeSegment(segment) {
	return String(segment).replace(/~/g, "~0").replace(/\//g, "~1")
}

function buildPointer(segments) {
	if (!segments.length) return ""
	return "/" + segments.map(encodeSegment).join("/")
}

function isIndex(segment) {
	return /^\d+$/.test(segment)
}

function getByPointer(doc, pointer) {
	const segments = parsePointer(pointer)
	let cur = doc
	for (const seg of segments) {
		if (cur === null || cur === undefined) return undefined
		if (Array.isArray(cur)) {
			if (!isIndex(seg)) return undefined
			cur = cur[Number(seg)]
		} else if (typeof cur === "object") {
			cur = cur[seg]
		} else {
			return undefined
		}
	}
	return cur
}

function getParent(doc, pointer) {
	const segments = parsePointer(pointer)
	if (!segments.length) {
		throw new Error("Cannot get parent of root")
	}
	const last = segments[segments.length - 1]
	const parent = getByPointer(doc, buildPointer(segments.slice(0, -1)))
	return { parent, key: last, isIndex: isIndex(last) }
}

/**
 * Produce a deep-cloned document with the value at `pointer` set to `value`.
 * Throws if the parent doesn't exist.
 */
function setByPointer(doc, pointer, value) {
	const clone = structuredClone(doc)
	const segments = parsePointer(pointer)
	if (!segments.length) {
		return value
	}
	let cur = clone
	for (let i = 0; i < segments.length - 1; i++) {
		const seg = segments[i]
		if (cur[seg] === undefined || cur[seg] === null) {
			throw new Error(
				`Path does not exist at "${buildPointer(segments.slice(0, i + 1))}"`,
			)
		}
		cur = cur[seg]
	}
	const last = segments[segments.length - 1]
	if (Array.isArray(cur) && isIndex(last)) {
		cur[Number(last)] = value
	} else {
		cur[last] = value
	}
	return clone
}

function deleteByPointer(doc, pointer) {
	const clone = structuredClone(doc)
	const segments = parsePointer(pointer)
	if (!segments.length) {
		throw new Error("Cannot delete root")
	}
	let cur = clone
	for (let i = 0; i < segments.length - 1; i++) {
		cur = cur[segments[i]]
		if (cur === undefined) {
			throw new Error(`Path does not exist: ${pointer}`)
		}
	}
	const last = segments[segments.length - 1]
	if (Array.isArray(cur) && isIndex(last)) {
		cur.splice(Number(last), 1)
	} else {
		delete cur[last]
	}
	return clone
}

/**
 * Insert a value into an array at `pointer` (must point to an array) at the
 * given position. `position` may be an integer or "end".
 */
function insertAt(doc, arrayPointer, item, position = "end") {
	const clone = structuredClone(doc)
	const arr = getByPointer(clone, arrayPointer)
	if (!Array.isArray(arr)) {
		throw new Error(`Pointer must reference an array: ${arrayPointer}`)
	}
	if (position === "end" || position === undefined) {
		arr.push(item)
		return { doc: clone, index: arr.length - 1 }
	}
	const idx = Number(position)
	if (!Number.isInteger(idx) || idx < 0 || idx > arr.length) {
		throw new Error(`Invalid position: ${position}`)
	}
	arr.splice(idx, 0, item)
	return { doc: clone, index: idx }
}

/**
 * Move an item from one pointer to another. Both must point to items inside
 * arrays; targetArray is the pointer to the destination array.
 */
function moveItem(doc, fromPointer, targetArrayPointer, position = "end") {
	const item = getByPointer(doc, fromPointer)
	if (item === undefined) {
		throw new Error(`Source does not exist: ${fromPointer}`)
	}
	const withoutItem = deleteByPointer(doc, fromPointer)

	// If the move is within the same array and we're shifting forward, the
	// source-removal may have reindexed the target. We recompute here: parse
	// the target array pointer and verify it still exists after removal.
	const targetArr = getByPointer(withoutItem, targetArrayPointer)
	if (!Array.isArray(targetArr)) {
		throw new Error(`Target must be an array: ${targetArrayPointer}`)
	}
	return insertAt(withoutItem, targetArrayPointer, item, position)
}

/**
 * Recursively walk a configuration document and return a flat list of all
 * cards with their JSON pointer, type, title, and a summary of children.
 *
 * Cards are discovered under:
 *   additionalTabs[]                          (root array of cards)
 *   <card>.cards[]                            (card_list)
 *   <card>.tabsList[].cards[]                 (tabs_list)
 */
function listCards(doc) {
	const out = []

	function walk(node, pointer) {
		if (!node || typeof node !== "object") return

		// If node looks like a card (has `type`), record it.
		if (typeof node.type === "string") {
			out.push({
				path: pointer,
				type: node.type,
				title: node.title ?? null,
				tabId: node.tabId ?? null,
				fieldCount: Array.isArray(node.fieldsList) ? node.fieldsList.length : 0,
			})
		}

		if (Array.isArray(node.cards)) {
			node.cards.forEach((c, i) => walk(c, `${pointer}/cards/${i}`))
		}
		if (Array.isArray(node.tabsList)) {
			node.tabsList.forEach((tab, i) => {
				if (Array.isArray(tab.cards)) {
					tab.cards.forEach((c, j) =>
						walk(c, `${pointer}/tabsList/${i}/cards/${j}`),
					)
				}
			})
		}
	}

	if (Array.isArray(doc?.additionalTabs)) {
		doc.additionalTabs.forEach((c, i) => walk(c, `/additionalTabs/${i}`))
	}
	return out
}

/**
 * List all fields under a fields_list card, with their JSON pointer.
 */
function listFields(doc, cardPointer) {
	const card = getByPointer(doc, cardPointer)
	if (!card || !Array.isArray(card.fieldsList)) {
		return []
	}
	return card.fieldsList.map((f, i) => ({
		path: `${cardPointer}/fieldsList/${i}`,
		type: f.type,
		name: f.name ?? null,
		label: f.label ?? null,
	}))
}

module.exports = {
	parsePointer,
	buildPointer,
	getByPointer,
	getParent,
	setByPointer,
	deleteByPointer,
	insertAt,
	moveItem,
	listCards,
	listFields,
}
