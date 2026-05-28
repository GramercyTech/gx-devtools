<template>
	<div class="gx-inspector-root">
		<!-- Active-mode indicator badge (suppressed when host-controlled) -->
		<div
			v-if="mode !== 'off' && !embedded"
			class="gx-inspector-badge"
			:class="mode"
		>
			<span class="gx-inspector-badge-dot" />
			{{ mode === "locate" ? "Locate mode" : "Select mode" }} — click an element
			· <kbd>Esc</kbd> to cancel
		</div>

		<ElementEditorModal
			v-if="selectedEl && !embedded"
			:element="selectedEl"
			:api-base="apiBase"
			:target-origin="targetOrigin"
			@close="closeEditor"
			@select-element="onSelectElement"
			@preview-change="reposition"
		/>
	</div>
</template>

<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount } from "vue"
import ElementEditorModal from "./ElementEditorModal.vue"
import {
	createInspectorCore,
	describeElement,
	getComponentTree,
} from "./inspector-core.js"

const props = defineProps({
	apiBase: { type: String, default: "" },
	targetOrigin: { type: String, default: "*" },
	embedded: { type: Boolean, default: false },
})

const emit = defineEmits(["select", "locate"])

const mode = ref("off")
const selectedEl = shallowRef(null)

let core = null

function openEditorFor(el) {
	selectedEl.value = el
	mode.value = "off"
	// In embedded mode the host renders its own editor from this payload;
	// standalone, the local modal opens (selectedEl drives its v-if).
	emit("select", describeElement(el))
}

function closeEditor() {
	selectedEl.value = null
	core?.clearSelection()
}

function onSelectElement({ el, highlightOnly }) {
	core?.highlight(el)
	if (!highlightOnly) {
		selectedEl.value = el
	}
}

function reposition() {
	// Live edits can change element geometry; keep the selection overlay aligned.
	requestAnimationFrame(() => core?.repositionSelection())
}

function describeSelection() {
	return selectedEl.value ? describeElement(selectedEl.value) : null
}

function highlightLoc(loc) {
	if (!loc || typeof document === "undefined") {
		return null
	}
	let el = null
	try {
		el = document.querySelector(`[data-gxp-loc="${loc}"]`)
	} catch {
		el = null
	}
	if (el) {
		selectedEl.value = el
		core?.highlight(el)
		return describeElement(el)
	}
	return null
}

function clearSelectionState() {
	selectedEl.value = null
	core?.clearSelection()
}

function componentTree() {
	return getComponentTree().map(({ name, depth, loc }) => ({
		name,
		depth,
		loc,
	}))
}

function setMode(next) {
	if (!core) {
		return
	}
	if (mode.value === next || next === "off") {
		core.disable()
		mode.value = "off"
		return
	}
	core.setMode(next)
	mode.value = next
}

function toggleSelect() {
	setMode("select")
}

function toggleLocate() {
	setMode("locate")
}

function handleKeydown(e) {
	// Ctrl/Cmd+Shift+I toggles Select mode (parity with the extension)
	if (
		(e.ctrlKey || e.metaKey) &&
		e.shiftKey &&
		(e.key === "I" || e.key === "i")
	) {
		e.preventDefault()
		toggleSelect()
	}
}

onMounted(() => {
	core = createInspectorCore({
		targetOrigin: props.targetOrigin,
		onSelect: openEditorFor,
		onLocate: (el, payload) => {
			mode.value = "off"
			emit("locate", payload)
		},
	})
	document.addEventListener("keydown", handleKeydown)
})

onBeforeUnmount(() => {
	document.removeEventListener("keydown", handleKeydown)
	core?.destroy()
})

defineExpose({
	setMode,
	toggleSelect,
	toggleLocate,
	mode,
	describeSelection,
	highlightLoc,
	clearSelection: clearSelectionState,
	getComponentTree: componentTree,
})
</script>

<style scoped>
.gx-inspector-root {
	position: relative;
}
.gx-inspector-badge {
	position: fixed;
	top: 12px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 2147483647;
	background: #f59e0b;
	color: #1e1e1e;
	font-family:
		-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	font-size: 12px;
	font-weight: 600;
	padding: 6px 14px;
	border-radius: 999px;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	display: flex;
	align-items: center;
	gap: 8px;
}
.gx-inspector-badge.locate {
	background: #61dafb;
}
.gx-inspector-badge-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #1e1e1e;
	animation: gx-inspector-blink 1s ease-in-out infinite;
}
.gx-inspector-badge kbd {
	background: rgba(0, 0, 0, 0.15);
	border-radius: 3px;
	padding: 1px 5px;
	font-family: inherit;
}
@keyframes gx-inspector-blink {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.3;
	}
}
</style>
