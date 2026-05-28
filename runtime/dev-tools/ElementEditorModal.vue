<template>
	<Teleport to="body">
		<div class="gx-el-editor gx-devtools-modal" @mousedown.stop @click.stop>
			<header class="gx-el-header">
				<div class="gx-el-title">
					<span class="gx-el-dot" />
					<span class="gx-el-label">{{ label }}</span>
				</div>
				<div class="gx-el-tabs">
					<button
						v-for="tab in tabs"
						:key="tab.id"
						:class="['gx-el-tab', { active: activeTab === tab.id }]"
						@click="activeTab = tab.id"
					>
						{{ tab.label }}
					</button>
				</div>
				<button class="gx-el-close" title="Close (Esc)" @click="$emit('close')">
					&times;
				</button>
			</header>

			<div class="gx-el-body">
				<!-- ELEMENT TAB -->
				<div v-if="activeTab === 'element'" class="gx-el-pane">
					<div class="gx-el-loc" :title="loc || ''">
						<span class="gx-el-muted">source</span>
						<code>{{ locDisplay }}</code>
						<button class="gx-el-mini" @click="openInSource">
							Open in source ↗
						</button>
					</div>

					<div v-if="canEditText" class="gx-el-field">
						<label>Text content</label>
						<textarea v-model="form.text" rows="2" @input="applyText" />
					</div>

					<div class="gx-el-field">
						<label>Classes</label>
						<input v-model="form.classes" type="text" @input="applyClasses" />
					</div>

					<div class="gx-el-field">
						<label>Inline style</label>
						<input v-model="form.style" type="text" @input="applyStyle" />
					</div>

					<div class="gx-el-field">
						<label>Attributes</label>
						<div class="gx-el-attrs">
							<div
								v-for="(attr, i) in form.attrs"
								:key="i"
								class="gx-el-attr-row"
							>
								<input
									v-model="attr.name"
									class="gx-el-attr-name"
									placeholder="name"
								/>
								<input
									v-model="attr.value"
									class="gx-el-attr-value"
									placeholder="value"
									@input="applyAttr(attr)"
								/>
								<button class="gx-el-attr-del" @click="removeAttr(i)">
									&times;
								</button>
							</div>
							<button class="gx-el-mini" @click="addAttr">
								+ Add attribute
							</button>
						</div>
					</div>

					<div class="gx-el-actions">
						<button class="gx-el-btn primary" @click="saveToSource">
							Save to source
						</button>
						<span class="gx-el-hint"
							>Edits above preview live; Save writes the .vue file.</span
						>
					</div>

					<div class="gx-el-extract">
						<div class="gx-el-section-title">Extract to GxP directive</div>
						<div v-if="canEditText" class="gx-el-extract-row">
							<input
								v-model="form.stringKey"
								type="text"
								placeholder="string key"
							/>
							<button class="gx-el-btn green" @click="extractString">
								gxp-string
							</button>
						</div>
						<div v-if="hasSrc" class="gx-el-extract-row">
							<input
								v-model="form.assetKey"
								type="text"
								placeholder="asset key"
							/>
							<button class="gx-el-btn green" @click="extractAsset">
								gxp-src
							</button>
						</div>
						<div v-if="!canEditText && !hasSrc" class="gx-el-muted">
							Select a text leaf (for gxp-string) or an image (for gxp-src).
						</div>
					</div>
				</div>

				<!-- COMPONENT TAB -->
				<div v-else class="gx-el-pane">
					<div class="gx-el-field">
						<label>Component</label>
						<div class="gx-el-comp-name">{{ component?.name || "—" }}</div>
						<div class="gx-el-muted gx-el-file">
							{{ component?.file || "Not a Vue component" }}
						</div>
					</div>

					<div v-if="stateRows.length" class="gx-el-field">
						<label
							>Reactive state
							<span class="gx-el-muted">(live · ephemeral)</span></label
						>
						<div class="gx-el-attrs">
							<div
								v-for="row in stateRows"
								:key="row.key"
								class="gx-el-attr-row"
							>
								<span class="gx-el-state-key">{{ row.key }}</span>
								<input
									v-if="row.kind === 'boolean'"
									type="checkbox"
									:checked="row.value"
									@change="applyState(row, $event.target.checked)"
								/>
								<input
									v-else
									:value="row.value"
									class="gx-el-attr-value"
									@input="applyState(row, $event.target.value)"
								/>
							</div>
						</div>
					</div>

					<div v-if="propsJson" class="gx-el-field">
						<label>Props</label>
						<pre class="gx-el-pre">{{ propsJson }}</pre>
					</div>

					<div class="gx-el-field">
						<label>Component tree</label>
						<div class="gx-el-tree">
							<button
								v-for="(node, i) in tree"
								:key="i"
								class="gx-el-tree-row"
								:class="{ current: node.el === element }"
								:style="{ paddingLeft: 8 + node.depth * 14 + 'px' }"
								@mouseenter="hoverNode(node)"
								@mouseleave="$emit('preview-change')"
								@click="selectNode(node)"
							>
								{{ node.name }}
							</button>
						</div>
					</div>

					<div class="gx-el-actions">
						<button class="gx-el-btn" @click="openInSource">
							Open in source ↗
						</button>
					</div>
				</div>
			</div>

			<footer v-if="status" class="gx-el-status" :class="status.type">
				{{ status.message }}
			</footer>
		</div>
	</Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from "vue"
import {
	getVueInstance,
	getComponentInfo,
	broadcastSource,
	buildElementLabel,
	parseLoc,
	textToKey,
	getComponentTree,
} from "./inspector-core.js"

const props = defineProps({
	element: { type: Object, required: true },
	apiBase: { type: String, default: "" },
	targetOrigin: { type: String, default: "*" },
})

const emit = defineEmits(["close", "select-element", "preview-change"])

const tabs = [
	{ id: "element", label: "Element" },
	{ id: "component", label: "Component" },
]
const activeTab = ref("element")
const status = ref(null)

const INTERNAL_ATTRS = ["class", "style", "data-gxp-loc", "data-gxp-expr"]

const form = reactive({
	text: "",
	classes: "",
	style: "",
	attrs: [],
	stringKey: "",
	assetKey: "",
})

let originalAttrNames = []

const loc = computed(
	() => props.element?.getAttribute?.("data-gxp-loc") || null,
)
const locDisplay = computed(() => {
	const parsed = loc.value ? parseLoc(loc.value) : null
	return parsed
		? `${parsed.filePath}:${parsed.line}:${parsed.column}`
		: "unknown"
})
const label = computed(() =>
	props.element ? buildElementLabel(props.element) : "",
)
const component = computed(() =>
	getComponentInfo(getVueInstance(props.element)),
)
const propsJson = computed(() => {
	const p = component.value?.props
	return p && Object.keys(p).length ? JSON.stringify(p, null, 2) : ""
})

const canEditText = computed(() => {
	const el = props.element
	if (!el) {
		return false
	}
	const hasElementChildren = el.children && el.children.length > 0
	const text = el.textContent?.trim()
	return !hasElementChildren && !!text
})

const hasSrc = computed(
	() =>
		!!props.element?.getAttribute?.("src") || props.element?.tagName === "IMG",
)

// ---- Reactive state rows (component tab) -------------------------------
const stateRows = ref([])

function buildStateRows() {
	const instance = getVueInstance(props.element)
	const state = instance?.setupState
	const rows = []
	if (state) {
		for (const key of Object.keys(state)) {
			const value = state[key]
			const t = typeof value
			if (t === "string" || t === "number" || t === "boolean") {
				rows.push({ key, value, kind: t, instance })
			}
		}
	}
	stateRows.value = rows
}

function applyState(row, raw) {
	try {
		let value = raw
		if (row.kind === "number") {
			value = Number(raw)
		} else if (row.kind === "boolean") {
			value = !!raw
		}
		row.instance.setupState[row.key] = value
		row.value = value
		emit("preview-change")
	} catch (e) {
		setStatus("error", `Could not set ${row.key}: ${e.message}`)
	}
}

// ---- Component tree (shared with the embedded-mode bridge) -------------
const tree = ref([])

function buildTree() {
	tree.value = getComponentTree()
}

function hoverNode(node) {
	if (node.el) {
		emit("select-element", { el: node.el, highlightOnly: true })
	}
}

function selectNode(node) {
	if (node.el) {
		emit("select-element", { el: node.el })
	}
}

// ---- Live preview application ------------------------------------------
function applyText() {
	if (!canEditText.value) {
		return
	}
	props.element.textContent = form.text
	emit("preview-change")
}

function applyClasses() {
	props.element.setAttribute("class", form.classes)
	emit("preview-change")
}

function applyStyle() {
	if (form.style.trim() === "") {
		props.element.removeAttribute("style")
	} else {
		props.element.setAttribute("style", form.style)
	}
	emit("preview-change")
}

function applyAttr(attr) {
	if (attr.name) {
		props.element.setAttribute(attr.name, attr.value)
		emit("preview-change")
	}
}

function addAttr() {
	form.attrs.push({ name: "", value: "" })
}

function removeAttr(index) {
	const attr = form.attrs[index]
	if (attr?.name) {
		props.element.removeAttribute(attr.name)
	}
	form.attrs.splice(index, 1)
	emit("preview-change")
}

// ---- Server persistence -------------------------------------------------
async function api(endpoint, body) {
	const res = await fetch(`${props.apiBase}/__gxp-inspector${endpoint}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
	return res.json()
}

function setStatus(type, message) {
	status.value = { type, message }
}

function currentAttrsObject() {
	const obj = {}
	for (const a of form.attrs) {
		if (a.name) {
			obj[a.name] = a.value
		}
	}
	return obj
}

async function saveToSource() {
	if (!loc.value) {
		setStatus(
			"error",
			"No source location for this element (data-gxp-loc missing).",
		)
		return
	}
	const currentNames = form.attrs.filter((a) => a.name).map((a) => a.name)
	const removed = originalAttrNames.filter((n) => !currentNames.includes(n))
	const set = {
		class: form.classes,
		style: form.style,
		attrs: currentAttrsObject(),
	}
	if (canEditText.value) {
		set.text = form.text
	}
	const result = await api("/update-element", {
		loc: loc.value,
		set,
		remove: removed,
	})
	if (result.success) {
		setStatus("success", `Saved to ${result.file}`)
		originalAttrNames = currentNames
	} else {
		setStatus("error", result.error || "Save failed")
	}
}

async function extractString() {
	const key = (form.stringKey || textToKey(form.text)).trim()
	if (!key) {
		setStatus("error", "A key is required")
		return
	}
	if (!loc.value) {
		setStatus("error", "No source location (data-gxp-loc missing).")
		return
	}
	const tagResult = await api("/update-element", {
		loc: loc.value,
		set: { attrs: { "gxp-string": key } },
	})
	if (!tagResult.success) {
		setStatus("error", tagResult.error || "Could not add gxp-string attribute")
		return
	}
	const stringResult = await api("/add-string", { key, value: form.text })
	if (stringResult.success) {
		props.element.setAttribute("gxp-string", key)
		setStatus("success", `Extracted gxp-string="${key}"`)
		syncAttrsFromElement()
	} else {
		setStatus("error", stringResult.error || "Could not register string")
	}
}

async function extractAsset() {
	const key = (form.assetKey || "").trim()
	if (!key) {
		setStatus("error", "An asset key is required")
		return
	}
	if (!loc.value) {
		setStatus("error", "No source location (data-gxp-loc missing).")
		return
	}
	const value = props.element.getAttribute("src") || ""
	const tagResult = await api("/update-element", {
		loc: loc.value,
		set: { attrs: { "gxp-src": key } },
	})
	if (!tagResult.success) {
		setStatus("error", tagResult.error || "Could not add gxp-src attribute")
		return
	}
	const assetResult = await api("/add-asset", { key, value })
	if (assetResult.success) {
		props.element.setAttribute("gxp-src", key)
		setStatus("success", `Extracted gxp-src="${key}"`)
		syncAttrsFromElement()
	} else {
		setStatus("error", assetResult.error || "Could not register asset")
	}
}

function openInSource() {
	const payload = broadcastSource(props.element, props.targetOrigin)
	setStatus(
		"success",
		payload.file
			? `Broadcast ${payload.file}:${payload.line}`
			: "Broadcast (no source location)",
	)
}

// ---- Sync form from element --------------------------------------------
function syncAttrsFromElement() {
	const el = props.element
	const attrs = []
	for (const attr of Array.from(el.attributes)) {
		if (!INTERNAL_ATTRS.includes(attr.name)) {
			attrs.push({ name: attr.name, value: attr.value })
		}
	}
	form.attrs = attrs
	originalAttrNames = attrs.map((a) => a.name)
}

function syncFromElement() {
	const el = props.element
	status.value = null
	form.text = canEditText.value ? el.textContent.trim() : ""
	form.classes = el.getAttribute("class") || ""
	form.style = el.getAttribute("style") || ""
	form.stringKey = el.getAttribute("gxp-string") || textToKey(form.text || "")
	form.assetKey = el.getAttribute("gxp-src") || ""
	syncAttrsFromElement()
	buildStateRows()
}

watch(
	() => props.element,
	() => {
		syncFromElement()
		if (activeTab.value === "component") {
			buildTree()
		}
	},
)

watch(activeTab, (tab) => {
	if (tab === "component") {
		buildStateRows()
		buildTree()
	}
})

function handleKeydown(e) {
	if (e.key === "Escape") {
		emit("close")
	}
}

onMounted(() => {
	syncFromElement()
	document.addEventListener("keydown", handleKeydown)
})

onUnmounted(() => {
	document.removeEventListener("keydown", handleKeydown)
})
</script>

<style scoped>
.gx-el-editor {
	position: fixed;
	bottom: 20px;
	right: 80px;
	width: 400px;
	max-height: 70vh;
	background: #1e1e1e;
	color: #e0e0e0;
	border: 1px solid #3d3d3d;
	border-radius: 8px;
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
	font-family:
		-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	font-size: 13px;
	z-index: 2147483647;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}
.gx-el-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	background: #2d2d2d;
	border-bottom: 1px solid #3d3d3d;
}
.gx-el-title {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	flex: 1;
}
.gx-el-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #61dafb;
	flex: none;
}
.gx-el-label {
	font-weight: 600;
	color: #61dafb;
	font-size: 12px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.gx-el-tabs {
	display: flex;
	gap: 2px;
}
.gx-el-tab {
	background: transparent;
	border: none;
	color: #888;
	padding: 4px 8px;
	border-radius: 4px;
	cursor: pointer;
	font-size: 12px;
}
.gx-el-tab.active {
	color: #61dafb;
	background: #3d3d3d;
}
.gx-el-close {
	background: none;
	border: none;
	color: #888;
	font-size: 20px;
	cursor: pointer;
	line-height: 1;
}
.gx-el-close:hover {
	color: #ff6b6b;
}
.gx-el-body {
	padding: 12px;
	overflow-y: auto;
}
.gx-el-field {
	margin-bottom: 12px;
}
.gx-el-field > label {
	display: block;
	font-size: 11px;
	text-transform: uppercase;
	color: #888;
	margin-bottom: 4px;
}
.gx-el-field input,
.gx-el-field textarea {
	width: 100%;
	box-sizing: border-box;
	background: #2d2d2d;
	border: 1px solid #3d3d3d;
	border-radius: 4px;
	padding: 6px 8px;
	color: #e0e0e0;
	font-size: 12px;
	font-family: inherit;
}
.gx-el-field input:focus,
.gx-el-field textarea:focus {
	outline: none;
	border-color: #61dafb;
}
.gx-el-loc {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 12px;
	font-size: 11px;
}
.gx-el-loc code {
	color: #9cdcfe;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	flex: 1;
}
.gx-el-muted {
	color: #777;
}
.gx-el-file {
	word-break: break-all;
	margin-top: 2px;
}
.gx-el-comp-name {
	font-size: 14px;
	font-weight: 600;
	color: #61dafb;
}
.gx-el-attrs {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.gx-el-attr-row {
	display: flex;
	align-items: center;
	gap: 6px;
}
.gx-el-attr-name {
	flex: 0 0 38%;
}
.gx-el-attr-value {
	flex: 1;
}
.gx-el-state-key {
	flex: 0 0 38%;
	color: #9cdcfe;
	font-size: 12px;
	overflow: hidden;
	text-overflow: ellipsis;
}
.gx-el-attr-del {
	background: none;
	border: none;
	color: #888;
	cursor: pointer;
	font-size: 16px;
}
.gx-el-attr-del:hover {
	color: #ff6b6b;
}
.gx-el-actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 12px 0;
}
.gx-el-hint {
	font-size: 10px;
	color: #777;
}
.gx-el-btn {
	background: #3d3d3d;
	color: #e0e0e0;
	border: none;
	border-radius: 4px;
	padding: 6px 12px;
	cursor: pointer;
	font-size: 12px;
	font-weight: 600;
}
.gx-el-btn:hover {
	background: #4d4d4d;
}
.gx-el-btn.primary {
	background: #61dafb;
	color: #1e1e1e;
}
.gx-el-btn.green {
	background: #28a745;
	color: #fff;
}
.gx-el-mini {
	background: none;
	border: 1px solid #3d3d3d;
	color: #9cdcfe;
	border-radius: 4px;
	padding: 3px 8px;
	cursor: pointer;
	font-size: 11px;
}
.gx-el-extract {
	border-top: 1px solid #3d3d3d;
	padding-top: 12px;
}
.gx-el-section-title {
	font-size: 11px;
	text-transform: uppercase;
	color: #888;
	margin-bottom: 8px;
}
.gx-el-extract-row {
	display: flex;
	gap: 6px;
	margin-bottom: 6px;
}
.gx-el-extract-row input {
	flex: 1;
	background: #2d2d2d;
	border: 1px solid #3d3d3d;
	border-radius: 4px;
	padding: 6px 8px;
	color: #e0e0e0;
	font-size: 12px;
}
.gx-el-pre {
	background: #2d2d2d;
	padding: 8px;
	border-radius: 4px;
	font-size: 11px;
	font-family: "Monaco", "Menlo", monospace;
	overflow-x: auto;
	max-height: 140px;
	margin: 0;
}
.gx-el-tree {
	display: flex;
	flex-direction: column;
	max-height: 180px;
	overflow-y: auto;
	background: #2d2d2d;
	border-radius: 4px;
	padding: 4px 0;
}
.gx-el-tree-row {
	background: none;
	border: none;
	color: #ccc;
	text-align: left;
	padding: 3px 8px;
	cursor: pointer;
	font-size: 12px;
}
.gx-el-tree-row:hover {
	background: #3d3d3d;
}
.gx-el-tree-row.current {
	color: #61dafb;
	font-weight: 600;
}
.gx-el-status {
	padding: 8px 12px;
	font-size: 12px;
	border-top: 1px solid #3d3d3d;
}
.gx-el-status.success {
	background: #28a74520;
	color: #4ade80;
}
.gx-el-status.error {
	background: #dc354520;
	color: #f87171;
}
</style>
