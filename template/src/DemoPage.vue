<template>
	<div class="demo-container">
		<div class="content-wrapper">
			<!--
				The GxP directives pull values from the datastore (app-manifest.json at dev-time).
				Open Dev Tools (Ctrl+Shift+D) to edit any of these live — the page reacts.
			-->

			<!-- Hero image: gxp-src swaps `src` to the URL keyed by "hero_image" in assets -->
			<img
				gxp-src="hero_image"
				src="/src/public/hero.jpg"
				alt="Hero"
				class="hero-image"
			/>

			<header class="hero">
				<!-- gxp-string replaces the element's text with the value keyed "welcome_title" in strings -->
				<h1 gxp-string="welcome_title">Welcome to the GxP Demo</h1>
				<p gxp-string="welcome_subtitle" class="subtitle">
					Edit these values live from the Dev Tools (Ctrl+Shift+D)
				</p>
			</header>

			<!-- gxp-settings + gxp-string: read from manifest.settings instead of strings -->
			<section class="panel">
				<h2>Settings <span class="tag">gxp-settings</span></h2>
				<dl>
					<dt>Primary color</dt>
					<dd>
						<span
							class="swatch"
							:style="{ backgroundColor: gxpStore.getSetting('primary_color') }"
						></span>
						<code gxp-settings gxp-string="primary_color">#FFD600</code>
					</dd>
					<dt>Accent color</dt>
					<dd>
						<span
							class="swatch"
							:style="{ backgroundColor: gxpStore.getSetting('accent_color') }"
						></span>
						<code gxp-settings gxp-string="accent_color">#2962FF</code>
					</dd>
					<dt>Company name</dt>
					<dd><code gxp-settings gxp-string="company_name">Acme Corp</code></dd>
				</dl>
			</section>

			<!-- gxp-state + gxp-string: read from triggerState (typically updated by sockets or CLI) -->
			<section class="panel">
				<h2>Trigger state <span class="tag">gxp-state</span></h2>
				<dl>
					<dt>Current status</dt>
					<dd><code gxp-state gxp-string="current_status">idle</code></dd>
					<dt>Last event</dt>
					<dd><code gxp-state gxp-string="last_event">none</code></dd>
				</dl>
			</section>

			<!-- Logo demo: another gxp-src -->
			<section class="panel logo-panel">
				<h2>Asset <span class="tag">gxp-src</span></h2>
				<img
					gxp-src="main_logo"
					src="/src/public/logo.png"
					alt="Logo"
					class="logo"
				/>
				<p class="hint">
					Change <code>assets.main_logo</code> in the Dev Tools Store Inspector
					and watch this image swap.
				</p>
			</section>

			<!-- Primary socket broadcast/listen demo -->
			<section class="panel socket-panel">
				<h2>Primary socket demo</h2>
				<p gxp-string="socket_hint" class="hint">
					Open this page in another window and messages broadcast on the
					'primary' socket will arrive in both.
				</p>

				<div class="socket-controls">
					<input
						v-model="messageDraft"
						type="text"
						placeholder="Type a message…"
						class="socket-input"
						@keyup.enter="sendMessage"
					/>
					<button @click="sendMessage" class="btn primary">
						<span gxp-string="send_button_label"
							>Broadcast to primary socket</span
						>
					</button>
					<button @click="openInNewWindow" class="btn secondary">
						<span gxp-string="open_window_button_label"
							>Open another window</span
						>
					</button>
				</div>

				<div class="socket-feed">
					<div class="feed-column">
						<h3>Sent from this window</h3>
						<ul v-if="sentMessages.length">
							<li v-for="(m, i) in sentMessages" :key="`s-${i}`">
								<span class="time">{{ m.time }}</span> {{ m.text }}
							</li>
						</ul>
						<p v-else class="empty">Nothing sent yet.</p>
					</div>
					<div class="feed-column">
						<h3>Received from other windows</h3>
						<ul v-if="receivedMessages.length">
							<li v-for="(m, i) in receivedMessages" :key="`r-${i}`">
								<span class="time">{{ m.time }}</span> {{ m.text }}
							</li>
						</ul>
						<p v-else class="empty">Waiting for a message…</p>
					</div>
				</div>
			</section>
		</div>
	</div>
</template>

<style scoped>
.demo-container {
	padding: 24px;
	max-width: 880px;
	margin: 0 auto;
	font-family:
		-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	color: #1f2937;
}

.content-wrapper {
	background: white;
	border-radius: 12px;
	padding: 32px;
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.hero-image {
	width: 100%;
	height: 180px;
	object-fit: cover;
	border-radius: 8px;
	margin-bottom: 20px;
	background: #f3f4f6;
}

.hero h1 {
	margin: 0 0 8px 0;
	color: v-bind('gxpStore.getSetting("primary_color")');
}

.subtitle {
	color: #6b7280;
	margin: 0 0 24px 0;
}

.panel {
	margin: 24px 0;
	padding: 20px;
	background: #f9fafb;
	border-radius: 8px;
	border-left: 4px solid v-bind('gxpStore.getSetting("accent_color")');
}

.panel h2 {
	margin: 0 0 16px 0;
	font-size: 18px;
	display: flex;
	align-items: center;
	gap: 10px;
}

.tag {
	font-size: 11px;
	font-weight: 500;
	padding: 2px 8px;
	background: #e5e7eb;
	color: #4b5563;
	border-radius: 4px;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

dl {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 8px 16px;
	margin: 0;
}

dt {
	font-weight: 600;
	color: #374151;
}

dd {
	margin: 0;
	display: flex;
	align-items: center;
	gap: 8px;
}

code {
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 14px;
	background: white;
	padding: 2px 6px;
	border-radius: 4px;
	border: 1px solid #e5e7eb;
}

.swatch {
	display: inline-block;
	width: 16px;
	height: 16px;
	border-radius: 3px;
	border: 1px solid #e5e7eb;
	vertical-align: middle;
}

.logo-panel {
	text-align: center;
}

.logo {
	max-width: 160px;
	height: auto;
	margin: 8px 0;
}

.hint {
	color: #6b7280;
	font-size: 14px;
	margin: 8px 0 0 0;
}

.socket-controls {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin: 16px 0;
}

.socket-input {
	flex: 1 1 220px;
	padding: 10px 12px;
	border: 1px solid #d1d5db;
	border-radius: 6px;
	font-size: 14px;
}

.btn {
	border: none;
	padding: 10px 16px;
	border-radius: 6px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 500;
	transition: opacity 0.15s;
}

.btn:hover {
	opacity: 0.9;
}

.btn.primary {
	background: v-bind('gxpStore.getSetting("primary_color")');
	color: #1f2937;
}

.btn.secondary {
	background: v-bind('gxpStore.getSetting("accent_color")');
	color: white;
}

.socket-feed {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 16px;
	margin-top: 16px;
}

.feed-column {
	background: white;
	border-radius: 6px;
	padding: 12px;
	border: 1px solid #e5e7eb;
	min-height: 120px;
}

.feed-column h3 {
	margin: 0 0 8px 0;
	font-size: 13px;
	color: #6b7280;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.feed-column ul {
	list-style: none;
	padding: 0;
	margin: 0;
	font-size: 14px;
}

.feed-column li {
	padding: 4px 0;
	border-bottom: 1px solid #f3f4f6;
}

.feed-column li:last-child {
	border-bottom: none;
}

.time {
	color: #9ca3af;
	font-size: 12px;
	margin-right: 6px;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.empty {
	color: #9ca3af;
	font-size: 14px;
	margin: 0;
	font-style: italic;
}

@media (max-width: 640px) {
	.socket-feed {
		grid-template-columns: 1fr;
	}
}
</style>

<script setup>
defineOptions({
	inheritAttrs: false,
})

import { ref, onMounted, onUnmounted } from "vue"
import { useGxpStore } from "@/stores/gxpPortalConfigStore"

const gxpStore = useGxpStore()

const messageDraft = ref("")
const sentMessages = ref([])
const receivedMessages = ref([])

let unsubscribe = null

const PRIMARY_SOCKET = "primary"
const DEMO_EVENT = "demo-message"

function timestamp() {
	return new Date().toLocaleTimeString()
}

function sendMessage() {
	const text = messageDraft.value.trim()
	if (!text) return

	gxpStore.broadcast(PRIMARY_SOCKET, DEMO_EVENT, {
		text,
		sentAt: Date.now(),
	})

	sentMessages.value.unshift({ text, time: timestamp() })
	messageDraft.value = ""
}

function openInNewWindow() {
	// Open a new window of the current page so two peers can exchange socket
	// messages via the primary socket.
	window.open(window.location.href, "_blank", "noopener,width=900,height=760")
}

onMounted(() => {
	unsubscribe = gxpStore.listen(PRIMARY_SOCKET, DEMO_EVENT, (data) => {
		const text =
			typeof data?.text === "string" ? data.text : JSON.stringify(data)
		receivedMessages.value.unshift({ text, time: timestamp() })
	})
})

onUnmounted(() => {
	if (typeof unsubscribe === "function") {
		unsubscribe()
	}
})
</script>
