// @vitest-environment happy-dom
/**
 * Parity tests for the dev gxpPortalConfigStore against the platform store
 * (experience-portal/resources/js/Store/gxpPortalConfigStore.js).
 *
 * A plugin treats the store as a black box: everything the platform store
 * returns must exist here with the same name and observable behaviour, even
 * though the transport underneath differs (Socket.IO relay + mock API / Vite
 * proxy instead of Laravel Echo against the portal origin).
 *
 * When the platform store gains a member, add it to PLATFORM_STORE_API and
 * implement it in runtime/stores/gxpPortalConfigStore.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createPinia, setActivePinia } from "pinia"

const socketMock = {
	on: vi.fn(),
	off: vi.fn(),
	emit: vi.fn(),
	disconnect: vi.fn(),
	connected: false,
}
const apiClientMock = {
	interceptors: {
		request: { use: vi.fn() },
		response: { use: vi.fn() },
	},
	get: vi.fn(() => Promise.resolve({ data: { ok: true } })),
	post: vi.fn(() => Promise.resolve({ data: { ok: true } })),
	put: vi.fn(() => Promise.resolve({ data: { ok: true } })),
	patch: vi.fn(() => Promise.resolve({ data: { ok: true } })),
	delete: vi.fn(() => Promise.resolve({ data: { ok: true } })),
}

vi.mock("axios", () => ({
	default: {
		create: vi.fn(() => apiClientMock),
		get: vi.fn(() => Promise.reject(new Error("no spec in tests"))),
		post: vi.fn(() => Promise.resolve({ data: { ok: true, multipart: true } })),
		put: vi.fn(() => Promise.resolve({ data: { ok: true, multipart: true } })),
		patch: vi.fn(() =>
			Promise.resolve({ data: { ok: true, multipart: true } }),
		),
		delete: vi.fn(),
	},
}))
vi.mock("socket.io-client", () => ({
	io: vi.fn(() => socketMock),
}))

import axios from "axios"

global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }))

// Every key the platform store's `return { ... }` exposes, grouped as there.
const PLATFORM_STORE_API = {
	state: [
		"pluginVars",
		"stringsList",
		"assetList",
		"staticAssetList",
		"dependencyList",
		"permissionFlags",
		"navigationFlagsKeyed",
		"auth",
		"userSession",
		"portalAssets",
		"portal",
		"sockets",
		"connectionStatus",
		"isOnline",
		"quizChannels",
		"theme",
		"triggerState",
		"form",
	],
	methods: [
		"attachFormStore",
		"apiGet",
		"apiPost",
		"apiPut",
		"apiDelete",
		"callApi",
		"resolveDependency",
		"initializeApiOperations",
		"getString",
		"getSetting",
		"getAsset",
		"getState",
		"hasPermission",
		"findDependency",
		"getGroups",
		"getGroupNames",
		"getGroupSlugs",
		"inGroup",
		"inAnyGroup",
		"connectQuizChannel",
		"leaveQuizChannel",
		"resyncQuizState",
		"emitSocket",
		"listenSocket",
		"listen",
		"broadcast",
		"useSocketListener",
		"loadPushSubscription",
		"ensurePushSubscription",
		"subscribeToPush",
		"unsubscribeFromPush",
		"updatePluginVar",
		"updateString",
		"updateAsset",
		"addDevAsset",
		"listAssets",
		"initializeData",
		"initializeSockets",
		"reset",
		"destroy",
	],
	// exposed as state on the platform (refs), read by plugins
	stateAlso: ["apiOperations", "pushSubscription"],
}

const PLATFORM_MODULE_EXPORTS = [
	"useGxpStore",
	"getGxpStoreById",
	"disposeGxpStore",
	"setDefaultPageStoreId",
	"GXP_STORE_ID_KEY",
]

const OPERATIONS = {
	"portal.v1.project.pages.list": {
		method: "get",
		path: "/v1/projects/{teamSlug}/{projectSlug}/pages",
		parameters: ["teamSlug", "projectSlug"],
	},
	"portal.v1.project.quiz.state": {
		method: "get",
		path: "/v1/projects/{teamSlug}/{projectSlug}/quiz/{form}/state",
		parameters: ["teamSlug", "projectSlug", "form"],
	},
	"portal.v1.project.quiz.answer": {
		method: "post",
		path: "/v1/projects/{teamSlug}/{projectSlug}/quiz/{form}/answer",
		parameters: ["teamSlug", "projectSlug", "form"],
	},
	"portal.v1.project.photo.upload": {
		method: "post",
		path: "/v1/projects/{teamSlug}/{projectSlug}/photos",
		parameters: ["teamSlug", "projectSlug"],
	},
}

let storeModule

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function freshStore(env = {}) {
	vi.resetModules()
	vi.stubEnv("VITE_API_ENV", env.VITE_API_ENV ?? "mock")
	vi.stubEnv("VITE_API_PROJECT_ID", env.VITE_API_PROJECT_ID ?? "")
	vi.stubEnv("VITE_USE_HTTPS", "false")
	vi.stubEnv("SOCKET_DRIVER", env.SOCKET_DRIVER ?? "io")
	setActivePinia(createPinia())
	storeModule = await import("../../runtime/stores/gxpPortalConfigStore.js")
	const store = storeModule.useGxpStore()
	// Store creation kicks off initializeApiOperations() (spec fetch, mocked
	// to fail → resets apiOperations to {}) and loadManifest(); let both
	// settle before seeding operations so they aren't clobbered.
	await flush()
	store.apiOperations = { ...OPERATIONS }
	return store
}

beforeEach(() => {
	vi.spyOn(console, "log").mockImplementation(() => {})
	vi.spyOn(console, "warn").mockImplementation(() => {})
	vi.spyOn(console, "error").mockImplementation(() => {})
	socketMock.on.mockClear()
	socketMock.off.mockClear()
	socketMock.emit.mockClear()
	socketMock.disconnect.mockClear()
	for (const fn of Object.values(apiClientMock)) {
		if (typeof fn?.mockClear === "function") fn.mockClear()
	}
	axios.post.mockClear()
})

afterEach(() => {
	vi.unstubAllEnvs()
	vi.restoreAllMocks()
})

describe("platform surface parity", () => {
	it("exposes every state key the platform store returns", async () => {
		const store = await freshStore()
		for (const key of [
			...PLATFORM_STORE_API.state,
			...PLATFORM_STORE_API.stateAlso,
		]) {
			expect(key in store, `missing state: ${key}`).toBe(true)
		}
	})

	it("exposes every method the platform store returns", async () => {
		const store = await freshStore()
		for (const key of PLATFORM_STORE_API.methods) {
			expect(typeof store[key], `missing method: ${key}`).toBe("function")
		}
	})

	it("exposes the platform module-level exports", async () => {
		await freshStore()
		for (const name of PLATFORM_MODULE_EXPORTS) {
			expect(name in storeModule, `missing export: ${name}`).toBe(true)
		}
		// Single dev store: any id resolves to the same instance.
		const a = storeModule.useGxpStore()
		const b = storeModule.useGxpStore("some-page-store-id")
		const c = storeModule.getGxpStoreById("another")
		expect(a).toBe(b)
		expect(a).toBe(c)
	})

	it("ships the platform's auth shape (auth.user) with a dev user", async () => {
		const store = await freshStore()
		expect(store.auth).toBeTruthy()
		expect(store.auth.user).toBeTruthy()
		expect(store.auth.user).toEqual(store.user)
		expect(Array.isArray(store.auth.user.groups)).toBe(true)
	})

	it("keeps the dev-only `user` mirror and auth.user in sync both ways", async () => {
		const store = await freshStore()
		store.user = null
		expect(store.auth.user).toBeNull()
		expect(store.isAuthenticated()).toBe(false)

		store.auth = { user: { id: 7, name: "Kai", groups: [] } }
		expect(store.user).toEqual({ id: 7, name: "Kai", groups: [] })
		expect(store.getUserName()).toBe("Kai")
	})
})

describe("callApi request paths", () => {
	it("mock env: base is the host root and requests carry the /api prefix", async () => {
		const store = await freshStore({ VITE_API_ENV: "mock" })
		expect(store.pluginVars.apiBaseUrl).toMatch(/^http:\/\/localhost:\d+$/)
		expect(store.pluginVars.apiBaseUrl.endsWith("/api")).toBe(false)

		await store.callApi("portal.v1.project.pages.list", null, { page: 2 })
		expect(apiClientMock.get).toHaveBeenCalledWith(
			"/api/v1/projects/team/project/pages",
			{ params: { page: 2 } },
		)
	})

	it("proxy env: base is /api-proxy (host root) and requests carry the /api prefix", async () => {
		// 2.1.x dropped the "/api" segment in proxy mode (the API hosts happen to
		// alias /v1 → /api/v1, so it worked by accident); the platform store
		// always sends /api/v1, and so do we.
		const store = await freshStore({
			VITE_API_ENV: "production",
			VITE_API_PROJECT_ID: "acme/expo",
		})
		expect(store.pluginVars.apiBaseUrl).toMatch(/\/api-proxy$/)

		await store.callApi("portal.v1.project.pages.list", null)
		expect(apiClientMock.get).toHaveBeenCalledWith(
			"/api/v1/projects/acme/expo/pages",
			{ params: {} },
		)
	})

	it("accepts the short operationId form and resolves dependency identifiers", async () => {
		const store = await freshStore()
		store.dependencyList = { form: "product-quiz" }

		await store.callApi("quiz.state", "form")
		expect(apiClientMock.get).toHaveBeenCalledWith(
			"/api/v1/projects/team/project/quiz/product-quiz/state",
			{ params: {} },
		)
	})

	it("uses the model ids from a mixed dependency binding for path params", async () => {
		const store = await freshStore()
		store.dependencyList = { form: [12, "#featured", "@untagged"] }

		await store.callApi("portal.v1.project.quiz.answer", "form", {
			answer: "a",
		})
		expect(apiClientMock.post).toHaveBeenCalledWith(
			"/api/v1/projects/team/project/quiz/12/answer",
			{ answer: "a" },
		)
		expect(store.resolveDependency("form")).toEqual({
			ids: [12],
			tags: ["featured"],
			untagged: true,
		})
	})

	it("sends Blob payloads as multipart via bare axios to the absolute URL", async () => {
		const store = await freshStore()
		const photo = new Blob(["png-bytes"], { type: "image/png" })

		const result = await store.callApi("portal.v1.project.photo.upload", null, {
			photo,
			caption: "hi",
		})

		expect(result).toEqual({ ok: true, multipart: true })
		expect(apiClientMock.post).not.toHaveBeenCalled()
		const [url, body, opts] = axios.post.mock.calls[0]
		expect(url).toBe(
			`${store.pluginVars.apiBaseUrl}/api/v1/projects/team/project/photos`,
		)
		expect(body).toBeInstanceOf(FormData)
		expect(body.get("caption")).toBe("hi")
		expect(body.get("photo")).toBeInstanceOf(Blob)
		expect(opts.headers.Authorization).toMatch(/^Bearer /)
		expect(opts.headers["X-Portal-Page-Token"]).toBeTruthy()
	})

	it("passes FormData through untouched", async () => {
		const store = await freshStore()
		const fd = new FormData()
		fd.append("photo", new Blob(["x"], { type: "image/jpeg" }), "x.jpg")

		await store.callApi("portal.v1.project.photo.upload", null, fd)
		expect(axios.post.mock.calls[0][1]).toBe(fd)
	})

	it("throws the platform's missing-parameter error", async () => {
		const store = await freshStore()
		await expect(
			store.callApi("portal.v1.project.quiz.state", "form"),
		).rejects.toThrow(/Missing required parameter: form/)
	})
})

describe("getters", () => {
	it("treat false/0/empty as real values (nullish fallback, like the platform)", async () => {
		const store = await freshStore()
		store.pluginVars = { ...store.pluginVars, show_header: false, count: 0 }
		store.stringsList = { empty: "" }
		store.triggerState = { step: 0 }

		expect(store.getSetting("show_header", true)).toBe(false)
		expect(store.getSetting("count", 5)).toBe(0)
		expect(store.getSetting("missing", "dflt")).toBe("dflt")
		expect(store.getString("empty", "fallback")).toBe("")
		expect(store.getState("step", 9)).toBe(0)
	})

	it("getAsset falls back to staticAssetList and to the fallback's basename key", async () => {
		const store = await freshStore()
		store.assetList = { hero: "https://cdn/hero.png" }
		store.staticAssetList = { "logo.svg": "https://cdn/logo.svg" }

		expect(store.getAsset("hero")).toBe("https://cdn/hero.png")
		expect(store.getAsset("nope", "/images/logo.svg")).toBe(
			"https://cdn/logo.svg",
		)
		expect(store.getAsset("nope", "/images/unknown.svg")).toBe(
			"/images/unknown.svg",
		)
	})

	it("group helpers read auth.user.groups", async () => {
		const store = await freshStore()
		store.auth = {
			user: {
				id: 1,
				groups: [
					{ name: "Speakers", slug: "speakers" },
					{ name: "VIP", slug: "vip" },
				],
			},
		}
		expect(store.getGroupNames()).toEqual(["Speakers", "VIP"])
		expect(store.getGroupSlugs()).toEqual(["speakers", "vip"])
		expect(store.inGroup("vip")).toBe(true)
		expect(store.inGroup("staff")).toBe(false)
		expect(store.inAnyGroup(["staff", "speakers"])).toBe(true)
		expect(store.inAnyGroup("staff")).toBe(false)

		store.auth = null
		expect(store.getGroups()).toEqual([])
	})

	it("theme has the platform's keys, derived from settings", async () => {
		const store = await freshStore()
		expect(Object.keys(store.theme).sort()).toEqual(
			[
				"background_color",
				"final_background_color",
				"final_text_color",
				"primary_color",
				"start_background_color",
				"start_text_color",
				"text_color",
			].sort(),
		)
		store.updatePluginVar("primary_color", "#123456")
		expect(store.theme.primary_color).toBe("#123456")
	})
})

describe("sockets", () => {
	it("primary socket exposes the platform methods and listen* return unsubscribers", async () => {
		const store = await freshStore()
		const primary = store.sockets.primary
		expect(typeof primary.broadcast).toBe("function")
		expect(typeof primary.listen).toBe("function")
		expect(typeof primary.listenForWhisper).toBe("function")
		expect(typeof primary.listenForStateChange).toBe("function")

		const cb = vi.fn()
		const off = primary.listen("ping", cb)
		expect(socketMock.on).toHaveBeenCalledWith("ping", cb)
		expect(typeof off).toBe("function")
		off()
		expect(socketMock.off).toHaveBeenCalledWith("ping", cb)

		primary.broadcast("pong", { a: 1 })
		expect(socketMock.emit).toHaveBeenCalledWith("pong", { a: 1 })
	})

	it("listenForStateChange merges `changes` into triggerState before the callback", async () => {
		const store = await freshStore()
		const cb = vi.fn()
		store.sockets.primary.listenForStateChange(cb)
		const [, wrapped] = socketMock.on.mock.calls.find(
			([event]) => event === "state-change",
		)
		wrapped({ changes: { step: 3 } })
		expect(store.getState("step")).toBe(3)
		expect(cb).toHaveBeenCalledWith({ changes: { step: 3 } })
	})

	it("store.listen/emitSocket/listenSocket/useSocketListener route to the named socket", async () => {
		const store = await freshStore()
		const cb = vi.fn()
		const off = store.listen("primary", "evt", cb)
		expect(socketMock.on).toHaveBeenCalledWith("evt", cb)
		off()
		expect(socketMock.off).toHaveBeenCalledWith("evt", cb)

		expect(typeof store.listenSocket("primary", "evt", cb)).toBe("function")
		expect(typeof store.useSocketListener("primary", "evt", cb)).toBe(
			"function",
		)
		expect(store.emitSocket("primary", "x", 1)).toBe(true)
		expect(socketMock.emit).toHaveBeenCalledWith("x", 1)
		expect(store.broadcast("nope", "x", 1)).toBe(true)
	})

	it("builds project/portal/attendee sockets from manifest context", async () => {
		const store = await freshStore()
		expect(store.sockets.project).toBeUndefined()
		store.applyManifest({
			portal: { id: 5, project_slug: "expo" },
			user: { id: 9, name: "A" },
		})
		store.initializeSockets()
		expect(typeof store.sockets.project.listen).toBe("function")
		expect(typeof store.sockets.portal.listenForWhisper).toBe("function")
		expect(typeof store.sockets.attendee.notification).toBe("function")
		expect(typeof store.sockets.attendee.listen).toBe("function")

		const off = store.listen("attendee", "notification", vi.fn())
		expect(typeof off).toBe("function")
	})

	it("dependency sockets return unsubscribers", async () => {
		const store = await freshStore()
		store.applyManifest({
			dependencies: [
				{
					identifier: "ai_interface",
					model: "AiInterface",
					events: { completed: "AiInterfaceCompleted" },
				},
			],
		})
		store.initializeSockets()
		const cb = vi.fn()
		const off = store.sockets.ai_interface.completed.listen(cb)
		expect(typeof off).toBe("function")
		off()
		expect(socketMock.off).toHaveBeenCalledWith(
			"AiInterfaceCompleted",
			expect.any(Function),
		)
	})

	it("quiz channels return { channel, echo, leave } like the platform", async () => {
		const store = await freshStore()
		const quiz = store.connectQuizChannel("f1")
		expect(quiz).toBe(store.connectQuizChannel("f1"))
		expect(typeof quiz.channel.listen).toBe("function")
		expect(typeof quiz.channel.whisper).toBe("function")
		expect(typeof quiz.leave).toBe("function")
		expect(quiz.echo).toBe(socketMock)
		store.leaveQuizChannel("f1")
		expect(store.quizChannels.f1).toBeUndefined()
	})

	it("leaving a quiz channel removes every listener it registered (Echo.leave semantics)", async () => {
		const store = await freshStore()
		const { channel, leave } = store.connectQuizChannel("f2")
		const onState = vi.fn()
		const onWhisper = vi.fn()
		const onNote = vi.fn()
		const detached = vi.fn()
		channel
			.listen(".QuizStateChanged", onState)
			.listenForWhisper("typing", onWhisper)
			.notification(onNote)
			.listen("early", detached)
			.stopListening("early", detached)
		socketMock.off.mockClear()

		leave()

		expect(socketMock.off).toHaveBeenCalledWith(".QuizStateChanged", onState)
		expect(socketMock.off).toHaveBeenCalledWith("typing", onWhisper)
		expect(socketMock.off).toHaveBeenCalledWith("notification", onNote)
		// already-detached listener is not touched again
		expect(socketMock.off).not.toHaveBeenCalledWith("early", detached)
		expect(store.quizChannels.f2).toBeUndefined()
	})

	it("dev-mock without SOCKET_URL warns instead of failing silently", async () => {
		await freshStore({ VITE_API_ENV: "dev-mock" })
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringMatching(/dev-mock requires SOCKET_URL/),
		)
	})

	it("tracks connectionStatus from the relay connection", async () => {
		const store = await freshStore()
		const handler = (name) =>
			socketMock.on.mock.calls.find(([event]) => event === name)[1]
		handler("connect")()
		expect(store.connectionStatus).toBe("connected")
		handler("disconnect")()
		expect(store.connectionStatus).toBe("disconnected")
	})
})

describe("lifecycle", () => {
	it("initializeData seeds the store from a platform-shaped payload", async () => {
		const store = await freshStore()
		await store.initializeData({
			pluginVars: { projectId: "acme/expo", primary_color: "#000" },
			stringsList: { hi: "Hello" },
			assetList: {},
			staticAssetList: { "a.png": "https://cdn/a.png" },
			dependencyList: { form: 3 },
			dependencies: [],
			permissionFlags: ["can_edit"],
			navigationFlagsKeyed: { home: true },
			auth: { user: { id: 1, groups: [] } },
			userSession: "sess",
			portalAssets: {},
			pageId: 42,
			portal: { id: 1, project_slug: "expo" },
			apiBaseUrl: "https://api.example.test",
			authToken: "tok",
			triggerState: { step: 1 },
			logout: () => {},
		})
		expect(store.getString("hi")).toBe("Hello")
		expect(store.hasPermission("can_edit")).toBe(true)
		expect(store.navigationFlagsKeyed).toEqual({ home: true })
		expect(store.getAsset("a.png")).toBe("https://cdn/a.png")
		expect(store.userSession).toBe("sess")
		expect(store.pluginVars.apiBaseUrl).toBe("https://api.example.test")
		expect(store.pluginVars.apiPageAuthId).toBe("tok")

		// initializeData re-fetches the OpenAPI operations (mocked to fail here,
		// which resets them) — re-seed before exercising callApi.
		store.apiOperations = { ...OPERATIONS }
		await store.callApi("portal.v1.project.pages.list", null)
		expect(apiClientMock.get).toHaveBeenCalledWith(
			"/api/v1/projects/acme/expo/pages",
			{ params: {} },
		)
	})

	it("reset clears state and tears down sockets; destroy also drops window listeners", async () => {
		const store = await freshStore()
		store.updateString("k", "v")
		store.reset()
		expect(store.stringsList).toEqual({})
		expect(store.auth).toBeNull()
		expect(store.sockets.primary).toBeUndefined()
		expect(store.connectionStatus).toBe("disconnected")
		expect(socketMock.disconnect).toHaveBeenCalled()

		const remove = vi.spyOn(window, "removeEventListener")
		store.destroy()
		expect(remove).toHaveBeenCalledWith("online", expect.any(Function))
		expect(remove).toHaveBeenCalledWith("offline", expect.any(Function))
	})

	it("destroy() unregisters the service-worker subscription-change handler", async () => {
		const sw = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
		Object.defineProperty(navigator, "serviceWorker", {
			value: sw,
			configurable: true,
		})
		try {
			const store = await freshStore()
			const [event, handler] = sw.addEventListener.mock.calls.find(
				([e]) => e === "message",
			)
			expect(event).toBe("message")
			expect(typeof handler).toBe("function")
			store.destroy()
			expect(sw.removeEventListener).toHaveBeenCalledWith("message", handler)
		} finally {
			delete navigator.serviceWorker
		}
	})

	it("push helpers degrade exactly like the platform without push support", async () => {
		const store = await freshStore()
		expect(await store.loadPushSubscription()).toBeNull()
		expect(await store.ensurePushSubscription()).toBeNull()
		await expect(store.subscribeToPush()).rejects.toThrow(/not supported|VAPID/)
		await expect(store.unsubscribeFromPush()).resolves.toBeUndefined()
		expect(store.pushSubscription).toBeNull()
	})

	it("update helpers: platform names and dev aliases", async () => {
		const store = await freshStore()
		store.updatePluginVar("mode", "kiosk")
		store.updateSetting("lang", "fr")
		store.updateString("greet", "Bonjour")
		store.updateAsset("logo", "https://cdn/logo.png")
		store.updateState("busy", true)
		expect(store.getSetting("mode")).toBe("kiosk")
		expect(store.getSetting("lang")).toBe("fr")
		expect(store.getString("greet")).toBe("Bonjour")
		expect(store.getAsset("logo")).toBe("https://cdn/logo.png")
		expect(store.getState("busy")).toBe(true)
	})
})
