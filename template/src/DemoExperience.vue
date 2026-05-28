<!--
  DemoExperience.vue — A teaching demo for @gxp-dev/app-ui's experience-flow system.

  WHAT IT IS
  ──────────
  A state-machine orchestrator + a set of prebuilt page components for building
  multi-stage interactive apps (kiosks, photo booths, AI flows, check-ins).

  The whole flow below is driven by ONE configuration object passed to
  `useExperience`. Pages emit data; the flow stores it in a reactive `context`;
  optional `action`s run between pages to call APIs or do work.

  WHAT THIS DEMO SHOWS
  ────────────────────
  1. `useExperience({ pages, … })`   — the orchestrator composable
  2. `useExperienceApi({ callApi })` — adapter that maps named ops to `callApi`
  3. `<ExperienceFlow :flow />`      — renderer with built-in loading / error UI
  4. Prebuilt pages (Welcome, Terms, Options, Camera, CameraReview, Drawing,
     Notepad, Loading, Final) with their default slots overridden
  5. Branching paths via `when: (ctx) => …`
  6. Async actions in three forms: named, inline function, and disabled
  7. Live state side-panel — current page, busy/error refs, context dump
  8. Reset, replay, jump-to-page controls — to make the state model visible

  PRODUCTION USE
  ──────────────
  In a real plugin, `callApi` comes from `gxpStore.callApi(operationId, perm, data)`.
  AppUI's adapter expects `(endpoint, payload) => Promise<T>` shape — we
  bridge that below with a tiny lambda. Replace the mock endpoints with your
  real operationIds and you're done.
-->

<template>
	<div class="demo-experience-page">
		<!-- Side panel with live flow state — great for understanding what's happening -->
		<aside class="state-panel">
			<header class="state-panel__header">
				<button class="back-link" @click="$emit('navigate', 'home')">
					← Back to Demo
				</button>
				<h2>Live Flow State</h2>
			</header>

			<section class="state-panel__section">
				<h3>Current page</h3>
				<code class="state-panel__value">{{ flow.pageName.value ?? "—" }}</code>
				<div class="state-panel__meta">
					index {{ flow.index.value }} / {{ flow.pages.value.length - 1 }} ·
					<span :class="{ pill: true, 'pill--on': flow.busy.value }">
						busy: {{ flow.busy.value }}
					</span>
					·
					<span :class="{ pill: true, 'pill--err': flow.error.value }">
						error: {{ flow.error.value?.message ?? "null" }}
					</span>
				</div>
			</section>

			<section class="state-panel__section">
				<h3>Context (reactive)</h3>
				<pre class="state-panel__dump">{{ contextSummary }}</pre>
			</section>

			<section class="state-panel__section">
				<h3>Controls</h3>
				<div class="state-panel__controls">
					<button
						class="ctrl"
						@click="flow.back()"
						:disabled="flow.isFirst.value"
					>
						← Back
					</button>
					<button class="ctrl" @click="flow.reset()">↺ Reset</button>
					<button class="ctrl" @click="forceError">Force error</button>
				</div>
				<div class="state-panel__controls">
					<button
						v-for="p in flow.pages.value"
						:key="p.name"
						class="ctrl ctrl--sm"
						:class="{ 'ctrl--active': flow.pageName.value === p.name }"
						@click="safeGoTo(p.name)"
						:title="`Jump to '${p.name}'`"
					>
						{{ p.name }}
					</button>
				</div>
			</section>

			<section class="state-panel__section">
				<h3>Tips</h3>
				<ul class="state-panel__tips">
					<li>
						Branching is via <code>when: (ctx) =&gt; …</code> on each page def.
					</li>
					<li>
						Actions can be a string (named op), an inline function, or
						<code>false</code> to disable.
					</li>
					<li>
						The QR + final page show how to read back from
						<code>flow.context</code>.
					</li>
				</ul>
			</section>
		</aside>

		<!-- The renderer. Slots forward through to the current page's slots. -->
		<main class="flow-area">
			<ExperienceFlow :flow="flow">
				<!--
          Custom loading + error UI — replaces the default overlays.
          These slots receive scoped props: `loading` gets nothing, `error`
          gets `{ error, retry }`.
        -->
				<template #loading>
					<div class="custom-loading">
						<div class="custom-loading__spinner" />
						<p>Talking to the platform…</p>
					</div>
				</template>

				<template #error="{ error, retry }">
					<div class="custom-error">
						<h3>Something went wrong</h3>
						<p>{{ error.message }}</p>
						<button class="custom-error__btn" @click="retry">Dismiss</button>
					</div>
				</template>
			</ExperienceFlow>
		</main>
	</div>
</template>

<script setup>
import { computed, reactive } from "vue"
import {
	useExperience,
	useExperienceApi,
	withExperienceDefaults,
	ExperienceFlow,
	WelcomePage,
	TermsPage,
	OptionsPage,
	CameraPage,
	CameraReviewPage,
	DrawingPage,
	NotepadPage,
	LoadingPage,
	FinalPage,
} from "@gxp-dev/app-ui"
// @gxp-dev/app-ui ships Tailwind utilities + theme tokens used by every page below.
// Imported here so the styles only load when the experience demo opens.
import "@gxp-dev/app-ui/styles"
import { useGxpStore } from "@/stores/gxpPortalConfigStore"

defineEmits(["navigate"])

const gxpStore = useGxpStore()

/* ─── Step 1: bridge gxpStore.callApi to app-ui's callApi shape ─────────────
 *
 * app-ui expects:   (endpoint, payload) => Promise<T>
 * gxpStore offers:  (operationId, permissionIdentifier, data) => Promise<T>
 *
 * For the demo we mock the network so it works offline. In production replace
 * the mock with the real `gxpStore.callApi(endpoint, '', payload)` line below.
 */
const MOCK_LATENCY_MS = 800

async function mockCallApi(endpoint, payload) {
	console.log("[demo] callApi", endpoint, payload)
	await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS))

	// Simulate the {data: …} envelope the real platform returns.
	if (endpoint === "social_stream.createPost") {
		return {
			data: {
				id: Math.floor(Math.random() * 10_000),
				file_url:
					payload instanceof FormData
						? URL.createObjectURL(payload.get("blob"))
						: "https://placehold.co/600x400?text=Demo+Post",
				caption: payload?.caption ?? null,
			},
		}
	}
	return { data: { ok: true } }
}

// Real wiring would look like this:
//   const callApi = (endpoint, payload) => gxpStore.callApi(endpoint, "", payload)
const callApi = mockCallApi

/* ─── Step 2: build the API adapter ────────────────────────────────────────
 *
 * useExperienceApi turns `callApi` into typed named operations:
 *   api.publishPost(data)  → callApi('social_stream.createPost', data)
 *   api.createPrintJob({…})
 *   api.processImage({blob, prompt})
 *   etc.
 *
 * You can override specific operations or remap endpoints — useful when your
 * backend uses different operationIds than the defaults.
 */
const api = useExperienceApi({
	callApi,

	// Per-op override example: replace the whole publishPost impl.
	// overrides: {
	//   publishPost: async (data) => ({ id: 1, file_url: '...' }),
	// },

	// Endpoint remap example: keep default behavior but call a different op.
	// endpoints: {
	//   publishPost: 'legacy.posts.create',
	// },
})

/* ─── Step 3: custom-tag a page with defaults ───────────────────────────────
 *
 * `withExperienceDefaults` attaches a default `action` + `resultKey` to a page
 * component, so the flow knows what to do when that page emits `next(data)`.
 *
 * Built-in pages already declare their defaults. For your own pages, wrap them.
 */
const TaggedNotepad = withExperienceDefaults(NotepadPage, {
	action: async (payload) => {
		// Inline function action — perfect for one-off work or composing API calls.
		console.log("[demo] note submitted:", payload.caption)
		return { savedAt: Date.now(), caption: payload.caption }
	},
	resultKey: "note",
})

/* ─── Step 4: define the flow ──────────────────────────────────────────────
 *
 * `pages` is an ordered array. Each entry has:
 *   - name:       string key (used by goTo and as default resultKey)
 *   - component:  any Vue component (built-in or your own)
 *   - props:      passed straight through to the page
 *   - when:       (ctx) => boolean — skip the page when this returns false
 *   - action:     'publishPost' | (data, ctx, api) => Promise<T> | false
 *   - resultKey:  where to stash the action's return value in `flow.context`
 *
 * Three action shapes are demonstrated below.
 */
const flow = useExperience({
	api,

	// Seed values on the context so pages can read from them.
	initialContext: {
		brand: "Acme",
		attendeeName: gxpStore.getSetting("company_name") || "Friend",
	},

	pages: [
		// ── Intro ────────────────────────────────────────────────────────────
		{
			name: "welcome",
			component: WelcomePage,
			props: {
				title: "Welcome to the Demo Kiosk",
				subtitle: "A guided tour of the experience-flow system",
				ctaText: "Let's begin →",
			},
		},

		{
			name: "terms",
			component: TermsPage,
			// Skip terms entirely if the user already accepted them in a prior run.
			when: (ctx) => !ctx.termsAccepted,
			props: {
				title: "Quick consent",
				html: `
          <p>By tapping <strong>Accept</strong> you agree this is a demo and
          no real data leaves your browser.</p>
          <p>Hit <em>Reset</em> in the side panel to start over at any time.</p>
        `,
				checkboxLabel: "I'm in",
			},
			// No action — TermsPage emits { accepted: true } and the flow stashes
			// it under resultKey 'termsAccepted' (its built-in default).
		},

		// ── Path picker (branching) ──────────────────────────────────────────
		{
			name: "pick",
			component: OptionsPage,
			props: {
				title: "Pick how you'd like to participate",
				subtitle: "We'll show a different flow for each",
				options: [
					{ key: "photo", label: "📷 Take a photo" },
					{ key: "drawing", label: "🎨 Draw something" },
					{ key: "note", label: "✍️ Leave a note" },
				],
				emitKeyOnly: true, // stash just the key string in ctx.choice
			},
		},

		// ── Photo branch ─────────────────────────────────────────────────────
		{
			name: "capture",
			component: CameraPage,
			when: (ctx) => ctx.choice === "photo",
			props: {
				countdown: 3,
				mirrored: true,
			},
			// CameraPage emits next(blob: Blob) → ctx.photoBlob (its default resultKey)
		},
		{
			name: "review",
			component: CameraReviewPage,
			when: (ctx) => ctx.choice === "photo",
			props: { allowCaption: true },
			// ⚡ This page's built-in default action is 'publishPost' — i.e. it
			// looks up api.publishPost and calls it with the emitted payload. The
			// result is stashed in ctx.post. No wiring needed here.
		},

		// ── Drawing branch ───────────────────────────────────────────────────
		{
			name: "draw",
			component: DrawingPage,
			when: (ctx) => ctx.choice === "drawing",
			props: {
				penColors: ["#000000", "#dc2626", "#2563eb", "#16a34a", "#facc15"],
				backgroundColors: ["#ffffff", "#fef3c7", "#dbeafe"],
				submitLabel: "Submit drawing",
			},
			// Inline function action that uploads the rendered blob.
			action: async (blob, _ctx, apiArg) => {
				return await apiArg.publishPost({ blob, caption: "From the easel" })
			},
			resultKey: "post",
		},

		// ── Note branch (uses our pre-tagged version) ────────────────────────
		{
			name: "note",
			component: TaggedNotepad,
			when: (ctx) => ctx.choice === "note",
			props: { title: "Write your message", maxCharacters: 140 },
		},

		// ── Async wait (only for paths that produced media) ──────────────────
		{
			name: "saving",
			component: LoadingPage,
			// Only show this for paths where we produced a post; the 'note' path
			// already finished its custom action.
			when: (ctx) => Boolean(ctx.post),
			props: {
				messages: [
					"Hanging your masterpiece in the gallery…",
					"Almost there…",
					"Polishing the frame…",
				],
				messageInterval: 1.4,
				// The LoadingPage's `task` runs as soon as the page mounts. Resolves
				// → next(result); rejects → flow.error. Great for polling.
				task: async (ctx) => {
					await new Promise((r) => setTimeout(r, 1800))
					return { hangedAt: Date.now(), postId: ctx.post?.id }
				},
			},
		},

		// ── Outcome ─────────────────────────────────────────────────────────
		{
			name: "final",
			component: FinalPage,
			props: {
				title: "✨ All done!",
				qrCaption: "Scan to take it home",
				qrUrl: "https://placehold.co/200x200/000/fff?text=QR",
				actions: [
					{ key: "email", label: "Email me", variant: "primary" },
					{ key: "download", label: "Download", variant: "secondary" },
				],
				showRestart: true,
			},
			// FinalPage emits `next` (restart) and `action(key)`. The flow's
			// `onComplete` (below) fires when we step past the last visible page.
		},
	],

	// Fires when next() is called on the last visible page. Great place to
	// analytics-log or kick off a post-flow handoff.
	onComplete: (ctx) => {
		console.log("[demo] flow complete; final context:", { ...ctx })
		// Restart from the top so the kiosk is ready for the next user.
		flow.reset()
	},

	// Optional global error trap. Return `true` to swallow so the flow stays
	// on the current page (otherwise the error appears in the error overlay).
	onError: (err, ctx) => {
		console.warn("[demo] action threw:", err, { ctx: { ...ctx } })
		// Return nothing → show the error overlay.
	},
})

/* ─── Side-panel helpers ───────────────────────────────────────────────── */

const reactiveCtx = reactive(flow.context)

const contextSummary = computed(() => {
	const snapshot = {}
	for (const [k, v] of Object.entries(reactiveCtx)) {
		if (v instanceof Blob) {
			snapshot[k] = `Blob<${v.type || "binary"}, ${v.size}B>`
		} else if (v && typeof v === "object") {
			snapshot[k] = v
		} else {
			snapshot[k] = v
		}
	}
	return JSON.stringify(snapshot, null, 2)
})

async function safeGoTo(name) {
	try {
		await flow.goTo(name)
	} catch (err) {
		// goTo throws if the target's `when` predicate is currently false.
		console.warn(err.message)
	}
}

function forceError() {
	// Tap into the same surface a thrown action would. Useful for previewing
	// the custom #error slot.
	flow.error.value = new Error("Demo error — dismiss to continue")
}
</script>

<style scoped>
.demo-experience-page {
	display: grid;
	grid-template-columns: 320px 1fr;
	height: 100vh;
	min-height: 600px;
	background: #0f172a;
	color: #e2e8f0;
	font-family:
		-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* ─── State panel ─────────────────────────────────────────────────────── */
.state-panel {
	background: #111827;
	border-right: 1px solid #1f2937;
	padding: 20px;
	overflow-y: auto;
}

.state-panel__header {
	margin-bottom: 20px;
}

.back-link {
	background: none;
	border: 0;
	color: #93c5fd;
	font-size: 13px;
	cursor: pointer;
	padding: 0;
	margin-bottom: 12px;
}
.back-link:hover {
	color: #bfdbfe;
}

.state-panel h2 {
	margin: 0;
	font-size: 16px;
	color: #f1f5f9;
}

.state-panel__section {
	margin-top: 20px;
	padding-top: 16px;
	border-top: 1px solid #1f2937;
}
.state-panel__section h3 {
	margin: 0 0 8px 0;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: #94a3b8;
}

.state-panel__value {
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 14px;
	color: #fbbf24;
}

.state-panel__meta {
	margin-top: 6px;
	font-size: 11px;
	color: #64748b;
	line-height: 1.6;
}

.pill {
	display: inline-block;
	padding: 1px 6px;
	border-radius: 4px;
	background: #1e293b;
	color: #cbd5e1;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pill--on {
	background: #1e3a8a;
	color: #bfdbfe;
}
.pill--err {
	background: #7f1d1d;
	color: #fecaca;
}

.state-panel__dump {
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 11px;
	line-height: 1.5;
	color: #cbd5e1;
	background: #0b1220;
	padding: 10px;
	border-radius: 6px;
	border: 1px solid #1f2937;
	max-height: 220px;
	overflow: auto;
	white-space: pre-wrap;
	margin: 0;
}

.state-panel__controls {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
}
.ctrl {
	font-size: 12px;
	background: #1f2937;
	color: #e2e8f0;
	border: 1px solid #334155;
	border-radius: 5px;
	padding: 5px 9px;
	cursor: pointer;
}
.ctrl:hover {
	background: #374151;
}
.ctrl:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.ctrl--sm {
	font-size: 11px;
	padding: 3px 7px;
}
.ctrl--active {
	background: #1e40af;
	border-color: #3b82f6;
	color: #dbeafe;
}

.state-panel__tips {
	font-size: 12px;
	color: #94a3b8;
	padding-left: 18px;
	margin: 0;
	line-height: 1.6;
}
.state-panel__tips code {
	background: #0b1220;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 11px;
	color: #fbbf24;
}

/* ─── Flow area ──────────────────────────────────────────────────────── */
.flow-area {
	background: var(--background, #f8fafc);
	color: var(--foreground, #0f172a);
	position: relative;
	overflow: hidden;
}

/* ─── Custom loading / error overrides ───────────────────────────────── */
.custom-loading {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 14px;
	color: #1e40af;
	font-weight: 500;
}
.custom-loading__spinner {
	width: 48px;
	height: 48px;
	border: 4px solid #93c5fd;
	border-right-color: transparent;
	border-radius: 50%;
	animation: demo-spin 0.9s linear infinite;
}
@keyframes demo-spin {
	to {
		transform: rotate(360deg);
	}
}

.custom-error {
	max-width: 420px;
	padding: 24px;
	background: white;
	border: 2px solid #dc2626;
	border-radius: 10px;
	text-align: center;
}
.custom-error h3 {
	margin: 0 0 8px 0;
	color: #b91c1c;
}
.custom-error p {
	margin: 0 0 14px 0;
	color: #374151;
}
.custom-error__btn {
	background: #dc2626;
	color: white;
	border: 0;
	padding: 8px 18px;
	border-radius: 6px;
	cursor: pointer;
	font-weight: 500;
}

/* Stack on narrow screens (mobile preview in dev) */
@media (max-width: 720px) {
	.demo-experience-page {
		grid-template-columns: 1fr;
		grid-template-rows: auto 1fr;
	}
	.state-panel {
		border-right: 0;
		border-bottom: 1px solid #1f2937;
		max-height: 240px;
	}
}
</style>
