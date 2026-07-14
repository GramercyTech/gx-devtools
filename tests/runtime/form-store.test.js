/**
 * Tests for the dev gxpFormStore and its attachment to gxpPortalConfigStore:
 *  - schema normalization (v2 root/cards/elements + plain sections)
 *  - form data seeding (defaults → prefill), helpers, validation
 *  - conditional visibility processing
 *  - dev submission transport (mockResponses → API → simulated fallback)
 *  - manifest-driven auto-attach as store.form (platform interface parity)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createPinia, setActivePinia } from "pinia"

vi.mock("axios", () => {
	const client = {
		interceptors: {
			request: { use: vi.fn() },
			response: { use: vi.fn() },
		},
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn(),
	}
	return {
		default: {
			create: vi.fn(() => client),
			get: vi.fn(() => Promise.reject(new Error("no spec in tests"))),
			post: vi.fn(),
		},
	}
})

vi.mock("socket.io-client", () => ({
	io: vi.fn(() => ({ on: vi.fn(), emit: vi.fn(), off: vi.fn() })),
}))

import axios from "axios"
import {
	useGxpFormStore,
	disposeGxpFormStore,
} from "../../runtime/stores/gxpFormStore.js"

global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }))

let keyCounter = 0
const nextKey = () => `test-form-${++keyCounter}`

const V2_SCHEMA = {
	root: { id: "root", cardType: "card-list", cardList: ["card-1"] },
	cards: {
		"card-1": {
			id: "card-1",
			title: "General",
			cardType: "element-list",
			elementList: ["el-1", "el-2", "el-3"],
		},
	},
	elements: {
		"el-1": {
			id: "el-1",
			type: "input",
			style: "text",
			name: "first_name",
			label: "First Name",
			required: true,
		},
		"el-2": {
			id: "el-2",
			type: "email",
			name: "contact_email",
			label: "Email",
			required: true,
		},
		"el-3": {
			id: "el-3",
			type: "input",
			name: "company",
			label: "Company",
			defaultValue: "Acme",
			conditions: {
				logic: "AND",
				rules: [{ field: "first_name", logic: "==", value: "Jane" }],
			},
		},
	},
}

function makeStore(payload = {}, options = {}) {
	const store = useGxpFormStore(nextKey())
	store.initialize({ schema: V2_SCHEMA, ...payload }, options)
	return store
}

beforeEach(() => {
	setActivePinia(createPinia())
	vi.clearAllMocks()
})

describe("schema normalization", () => {
	it("normalizes a v2 {root, cards, elements} schema into sections", () => {
		const store = makeStore()
		const sections = store.getSections()

		expect(sections).toHaveLength(1)
		expect(sections[0].title).toBe("General")
		expect(sections[0].fields).toHaveLength(3)
		expect(sections[0].fields[0].slug).toBe("first_name")
		expect(sections[0].fields[0].required).toBe(true)
		expect(sections[0].fields[2].default_value).toBe("Acme")
	})

	it("normalizes a plain sections array with v1-style field keys", () => {
		const store = useGxpFormStore(nextKey())
		store.initialize({
			sections: [
				{
					title: "Info",
					fields: [
						{ slug: "age", label: "Age", is_required: true, type: "number" },
					],
				},
			],
		})

		const field = store.getElement("age")
		expect(field.required).toBe(true)
		expect(field.type).toBe("number")
	})

	it("finds elements by slug and returns null for unknown slugs", () => {
		const store = makeStore()
		expect(store.getElement("contact_email").label).toBe("Email")
		expect(store.getElement("nope")).toBeNull()
	})
})

describe("form data", () => {
	it("seeds defaults then applies prefill data on top", () => {
		const store = makeStore({ prefillData: { first_name: "Ada" } })

		expect(store.formData.company).toBe("Acme")
		expect(store.formData.first_name).toBe("Ada")
		expect(store.formData.contact_email).toBe("")
	})

	it("adopts an external data object by reference", () => {
		const shared = {}
		const store = makeStore({}, { data: shared })

		store.setValue("first_name", "Jane")
		expect(shared.first_name).toBe("Jane")
	})

	it("setValue clears a recorded field error", () => {
		const store = makeStore()
		store.validateForm()
		expect(store.errors.first_name).toBeTruthy()

		store.setValue("first_name", "Jane")
		expect(store.errors.first_name).toBeUndefined()
	})
})

describe("validation", () => {
	it("flags required fields and invalid email types", () => {
		const store = makeStore()
		expect(store.validateForm()).toBe(false)
		expect(store.errors.first_name).toContain("required")

		store.setValue("first_name", "Jane")
		store.setValue("contact_email", "not-an-email")
		store.validateForm()
		expect(store.errors.contact_email).toContain("valid email")

		store.setValue("contact_email", "jane@example.com")
		expect(store.validateForm()).toBe(true)
	})

	it("applies Laravel-style string rules (min, in)", () => {
		const store = useGxpFormStore(nextKey())
		store.initialize({
			sections: [
				{
					fields: [
						{
							slug: "size",
							label: "Size",
							validation_rules: ["in:small,large"],
						},
					],
				},
			],
		})

		store.setValue("size", "medium")
		expect(store.validateField("size")).toContain("valid option")
		store.setValue("size", "large")
		expect(store.validateField("size")).toBeNull()
	})
})

describe("conditional processing", () => {
	it("filters hidden elements and skips them in validation", () => {
		const store = makeStore(
			{
				schema: {
					...V2_SCHEMA,
					elements: {
						...V2_SCHEMA.elements,
						"el-3": {
							...V2_SCHEMA.elements["el-3"],
							required: true,
						},
					},
				},
			},
			{ conditions: true },
		)

		store.setValue("first_name", "Bob")
		store.setValue("contact_email", "bob@example.com")
		expect(store.getElements().map((f) => f.slug)).toEqual([
			"first_name",
			"contact_email",
		])
		expect(store.validateForm()).toBe(true)

		store.setValue("first_name", "Jane")
		expect(store.getElements().map((f) => f.slug)).toContain("company")
	})

	it("keeps every element visible when conditions are disabled", () => {
		const store = makeStore()
		expect(store.getElements()).toHaveLength(3)
	})

	it("can be enabled from the manifest payload (conditions: true)", () => {
		const store = makeStore({ conditions: true })
		expect(store.conditionsEnabled).toBe(true)
	})
})

describe("submission (dev transport)", () => {
	const validData = { first_name: "Jane", contact_email: "jane@example.com" }

	it("returns validation errors without delivering when invalid", async () => {
		const store = makeStore()
		const result = await store.submit()

		expect(result.success).toBe(false)
		expect(result.errors.first_name).toBeTruthy()
		expect(axios.post).not.toHaveBeenCalled()
	})

	it("returns the manifest mockResponses.submit verbatim", async () => {
		const store = makeStore({
			prefillData: validData,
			mockResponses: { submit: { success: true, status: "created", id: 42 } },
		})

		const result = await store.submit()
		expect(result).toEqual({ success: true, status: "created", id: 42 })
		expect(store.submitted).toBe(true)
		expect(axios.post).not.toHaveBeenCalled()
	})

	it("POSTs to the registration-form API when apiBaseUrl is configured", async () => {
		axios.post.mockResolvedValueOnce({
			data: { success: true, status: "created" },
		})
		const store = makeStore({
			prefillData: validData,
			customSettings: {
				apiBaseUrl: "http://localhost:3069/api",
				projectId: "team/project",
			},
		})

		const result = await store.submit({ access_code: "VIP" })

		expect(axios.post).toHaveBeenCalledTimes(1)
		const [url, payload] = axios.post.mock.calls[0]
		expect(url).toContain("/api/v1/projects/team/project/registration-forms/")
		expect(url).toContain("/submit")
		expect(payload.first_name).toBe("Jane")
		expect(payload.access_code).toBe("VIP")
		expect(result.success).toBe(true)
		expect(store.submitted).toBe(true)
	})

	it("falls back to a simulated result when the endpoint 404s", async () => {
		axios.post.mockRejectedValueOnce({ response: { status: 404 } })
		const store = makeStore({
			prefillData: validData,
			customSettings: { apiBaseUrl: "http://localhost:3069/api" },
		})

		const result = await store.submit()
		expect(result.success).toBe(true)
		expect(result.simulated).toBe(true)
		expect(store.submitted).toBe(true)
	})

	it("simulates directly when no apiBaseUrl is configured", async () => {
		const store = makeStore({ prefillData: validData })

		const result = await store.submit()
		expect(result.simulated).toBe(true)
		expect(axios.post).not.toHaveBeenCalled()
	})

	it("maps a real 422 response onto field errors", async () => {
		axios.post.mockRejectedValueOnce({
			response: {
				status: 422,
				data: { errors: { contact_email: ["Contact Email is required"] } },
			},
		})
		const store = makeStore({
			prefillData: validData,
			customSettings: { apiBaseUrl: "http://localhost:3069/api" },
		})

		const result = await store.submit()
		expect(result.success).toBe(false)
		expect(store.errors.contact_email).toBe("Contact Email is required")
		expect(store.submitted).toBe(false)
	})

	it("returns a 409 duplicate payload for the app to prompt on", async () => {
		axios.post.mockRejectedValueOnce({
			response: {
				status: 409,
				data: { duplicate: true, attendee_id: 7 },
			},
		})
		const store = makeStore({
			prefillData: validData,
			customSettings: { apiBaseUrl: "http://localhost:3069/api" },
		})

		const result = await store.submit()
		expect(result.duplicate).toBe(true)
		expect(result.attendee_id).toBe(7)
	})

	it("confirmUpdateExisting resubmits with the update flags", async () => {
		axios.post.mockResolvedValueOnce({
			data: { success: true, status: "updated" },
		})
		const store = makeStore({
			customSettings: { apiBaseUrl: "http://localhost:3069/api" },
		})

		const result = await store.confirmUpdateExisting(7)

		const [, payload] = axios.post.mock.calls[0]
		expect(payload._update_existing).toBe(true)
		expect(payload._existing_attendee_id).toBe(7)
		expect(result.status).toBe("updated")
	})

	it("saveProgress stores the returned session token", async () => {
		const store = makeStore({
			prefillData: validData,
			mockResponses: {
				saveProgress: { success: true, session_token: "tok-1" },
			},
		})

		await store.saveProgress("jane@example.com")
		expect(store.resumeSession.session_token).toBe("tok-1")
	})
})

describe("registry", () => {
	it("returns the same instance for the same key and a fresh one after dispose", () => {
		const key = nextKey()
		const a = useGxpFormStore(key)
		a.initialize({ schema: V2_SCHEMA })
		expect(useGxpFormStore(key)).toBe(a)

		disposeGxpFormStore(key)
		const b = useGxpFormStore(key)
		expect(b).not.toBe(a)
		expect(b.isInitialized).toBe(false)
	})
})

describe("gxpPortalConfigStore integration", () => {
	async function makePortalStore() {
		const { useGxpStore } =
			await import("../../runtime/stores/gxpPortalConfigStore.js")
		return useGxpStore()
	}

	it("attaches store.form from the manifest form section", async () => {
		const store = await makePortalStore()
		store.applyManifest({
			form: {
				formId: nextKey(),
				schema: V2_SCHEMA,
				prefillData: { first_name: "Jane" },
			},
		})

		expect(store.form).toBeTruthy()
		expect(store.form.getElements()).toHaveLength(3)
		expect(store.form.formData.first_name).toBe("Jane")
		expect(store.pluginVars.formId).toBe(store.form.slug)
	})

	it("attaches store.form from settings.formId alone", async () => {
		const store = await makePortalStore()
		const formId = nextKey()
		store.applyManifest({ settings: { formId } })

		expect(store.form).toBeTruthy()
		expect(store.form.slug).toBe(formId)
		expect(store.form.getElements()).toEqual([])
	})

	it("rebuilds the form store on manifest hot-reload", async () => {
		const store = await makePortalStore()
		const formId = nextKey()
		store.applyManifest({ form: { formId, schema: V2_SCHEMA } })
		store.form.setValue("first_name", "unsaved")

		store.applyManifest({
			form: {
				formId,
				sections: [{ fields: [{ slug: "only_field", label: "Only" }] }],
			},
		})

		expect(store.form.getElements().map((f) => f.slug)).toEqual(["only_field"])
		expect(store.form.formData.first_name).toBeUndefined()
	})

	it("leaves store.form null when the manifest has no form config", async () => {
		const store = await makePortalStore()
		store.applyManifest({ settings: { primary_color: "#fff" } })
		expect(store.form).toBeNull()
	})
})
