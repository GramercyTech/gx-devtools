import { defineStore, getActivePinia } from "pinia"
import { ref, computed } from "vue"
import axios from "axios"

// Registry to track created form stores by their ID (mirrors gxpPortalConfigStore)
const formStoreRegistry = new Map()

const WEB_HEADERS = { "X-Requested-With": "XMLHttpRequest" }

// ---------------------------------------------------------------------------
// Condition evaluation (dev port of the platform's useConditionParams)
// ---------------------------------------------------------------------------

const str = (val) => String(val ?? "")

const toList = (val) =>
	str(val)
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s !== "")

function getNestedProperty(obj, path) {
	if (!obj || !path) return undefined
	return path
		.split(".")
		.reduce(
			(cur, key) => (cur && typeof cur === "object" ? cur[key] : undefined),
			obj,
		)
}

function testElement(element, dataModel) {
	const modelPathArray = []
	if (element.column) modelPathArray.push(...element.column.split("."))
	if (element.name) modelPathArray.push(...element.name.split("."))
	const modelValue =
		dataModel && typeof dataModel === "object"
			? getNestedProperty(dataModel, modelPathArray.join("."))
			: ""

	let conditionValue
	if (
		element.value &&
		typeof element.value === "object" &&
		!Array.isArray(element.value)
	) {
		const conditionPathArray = []
		if (element.value.column)
			conditionPathArray.push(...element.value.column.split("."))
		if (element.value.name)
			conditionPathArray.push(...element.value.name.split("."))
		conditionValue =
			dataModel && typeof dataModel === "object"
				? getNestedProperty(dataModel, conditionPathArray.join("."))
				: ""
	} else {
		conditionValue = element.value ?? ""
	}

	switch (element.logic) {
		case "==":
			return modelValue == conditionValue
		case "!=":
			return modelValue != conditionValue
		case ">":
			return modelValue > conditionValue
		case "<":
			return modelValue < conditionValue
		case ">=":
			return modelValue >= conditionValue
		case "<=":
			return modelValue <= conditionValue
		case "in-array":
			return conditionValue?.includes(modelValue)
		case "not-in-array":
			return !conditionValue?.includes(modelValue)
		case "contains":
			return str(modelValue).includes(str(conditionValue))
		case "not-contains":
			return !str(modelValue).includes(str(conditionValue))
		case "g0length":
			return modelValue?.length > 0
		case "n0length":
			return modelValue?.length == 0
		case "starts-with":
			return modelValue && modelValue?.startsWith(conditionValue)
		case "ends-with":
			return modelValue && modelValue?.endsWith(conditionValue)
		case "is-odd":
			return modelValue % 2 == 1
		case "is-even":
			return modelValue % 2 == 0
		case "is_not_null":
			return modelValue !== null
		case "is_null":
			return modelValue === null
		case "is-true":
			return (
				modelValue === true ||
				modelValue === "true" ||
				modelValue === 1 ||
				modelValue === "1"
			)
		case "is-false":
			return (
				modelValue === false ||
				modelValue === "false" ||
				modelValue === 0 ||
				modelValue === "0"
			)
		case "is-any-of":
			return toList(conditionValue).includes(str(modelValue))
		case "is-none-of":
			return !toList(conditionValue).includes(str(modelValue))
		case "divisible-by":
			return modelValue % conditionValue === 0
		case "not-divisible-by":
			return modelValue % conditionValue !== 0
	}
}

export function passConditionParams(paramList, dataObject, groupLogic = "AND") {
	const test = (element) =>
		element.conditionParams
			? passConditionParams(
					element.conditionParams,
					dataObject,
					element.conditionGroupLogic,
				)
			: testElement(element, dataObject)
	return groupLogic == "AND" ? paramList.every(test) : paramList.some(test)
}

/**
 * Dispose a form store created via useGxpFormStore.
 */
export const disposeGxpFormStore = (formKey) => {
	const storeId = `gxp-form-${formKey}`
	if (formStoreRegistry.has(storeId)) {
		const store = formStoreRegistry.get(storeId)
		if (store.$dispose) {
			store.$dispose()
		}
		// $dispose leaves the state snapshot behind; drop it so a
		// re-created store with the same id starts fresh.
		const pinia = getActivePinia()
		if (pinia) {
			delete pinia.state.value[storeId]
		}
		formStoreRegistry.delete(storeId)
	}
}

/**
 * Per-form Pinia store — the dev-server clone of the platform's gxpFormStore
 * with the identical public interface: form schema (with section/element
 * helpers), the form's data object, per-field + whole-form validation,
 * optional conditional-visibility processing, and submit/update calls.
 *
 * It is automatically attached to the gxpPortalConfigStore as `gxpStore.form`
 * whenever app-manifest.json declares a `form` section (or settings.formId),
 * so plugin authors can use `gxpStore.form.getElements()` exactly like they
 * would on-platform.
 *
 * Dev submission transport (instead of the platform web routes):
 *   1. `mockResponses.submit` / `mockResponses.saveProgress` from the
 *      manifest's form section are returned verbatim when present.
 *   2. Otherwise the store POSTs to the registration-form API under the
 *      configured apiBaseUrl (the local mock API, or a real environment
 *      through the dev proxy).
 *   3. On 404 / network failure it falls back to a simulated success result
 *      (`simulated: true`), logs it, and broadcasts a `gxp:form-submit`
 *      CustomEvent on window — the same dev-transport philosophy as the
 *      analytics plugin.
 *
 * @param {string|number} formKey - form slug or id (unique per form instance)
 */
export const useGxpFormStore = (formKey) => {
	const storeId = `gxp-form-${formKey}`

	if (formStoreRegistry.has(storeId)) {
		return formStoreRegistry.get(storeId)
	}

	const store = defineStore(storeId, () => {
		const isInitialized = ref(false)
		const slug = ref(null)
		const formName = ref("")
		const description = ref("")
		const sections = ref([])
		const settings = ref(null)
		const strings = ref({})
		const registrationMode = ref("new_only")
		const isAuthenticated = ref(false)
		const resumeSession = ref(null)
		const prefillData = ref({})
		const customSettings = ref({})

		// Dev-only: manifest-provided canned results for submit/saveProgress.
		const mockResponses = ref({})

		// The entire form's data object, keyed by field slug. Held by
		// reference so renderers can share the same object.
		const formData = ref({})
		const errors = ref({})
		const processing = ref(false)
		const submitted = ref(false)
		const lastResult = ref(null)

		// Conditional-schema processing is opt-in: when enabled, section and
		// element getters evaluate condition_params against formData and
		// hidden fields are skipped by validation.
		const conditionsEnabled = ref(false)

		/**
		 * Normalize a field/element from any source shape to guaranteed keys:
		 * slug, label, type, required, default_value, validation_rules,
		 * condition_params — while preserving the original keys.
		 */
		function normalizeField(field) {
			return {
				...field,
				slug: field.slug ?? field.name,
				label: field.label ?? field.slug ?? field.name,
				required: field.required ?? field.is_required ?? false,
				default_value: field.default_value ?? field.defaultValue ?? "",
				validation_rules: field.validation_rules ?? field.validation ?? null,
				condition_params: field.condition_params ?? field.conditions ?? null,
				columns: field.columns ?? 12,
				columnsSm: field.columnsSm ?? field.columns ?? 12,
				columnsMd: field.columnsMd ?? field.columnsSm ?? field.columns ?? 12,
				columnsLg:
					field.columnsLg ??
					field.columnsMd ??
					field.columnsSm ??
					field.columns ??
					12,
				columnsXl:
					field.columnsXl ??
					field.columnsLg ??
					field.columnsMd ??
					field.columnsSm ??
					field.columns ??
					12,
			}
		}

		/**
		 * Convert a v2 schema ({root, cards, elements}) into a nested
		 * sections array of {id, title, conditions, fields, sections}.
		 */
		function sectionsFromV2(schemaV2) {
			const cards = schemaV2.cards ?? {}
			const elements = schemaV2.elements ?? {}

			const buildSection = (cardId) => {
				const card = cards[cardId]
				if (!card) return null
				const childIds = [...(card.tabList ?? []), ...(card.cardList ?? [])]
				return {
					id: card.id ?? cardId,
					title: card.title ?? "",
					type: card.cardType ?? card.type ?? "card",
					condition_params: card.condition_params ?? card.conditions ?? null,
					columns: card.columns ?? 12,
					columnsSm: card.columnsSm ?? card.columns ?? 12,
					columnsMd: card.columnsMd ?? card.columnsSm ?? card.columns ?? 12,
					columnsLg:
						card.columnsLg ??
						card.columnsMd ??
						card.columnsSm ??
						card.columns ??
						12,
					columnsXl:
						card.columnsXl ??
						card.columnsLg ??
						card.columnsMd ??
						card.columnsSm ??
						card.columns ??
						12,
					fields: (card.elementList ?? [])
						.map((elementId) => elements[elementId])
						.filter(Boolean)
						.map(normalizeField),
					sections: childIds.map(buildSection).filter(Boolean),
				}
			}

			const rootIds = [
				...(schemaV2.root?.tabList ?? []),
				...(schemaV2.root?.cardList ?? []),
			]
			return rootIds.map(buildSection).filter(Boolean)
		}

		/**
		 * Normalize the many shapes a form arrives in:
		 *  - Platform props / manifest schema: { form|formSchema|schema: {root, cards, elements} } (v2)
		 *  - Plugin pipeline (ProjectFormResource): { formSchema: { form_schema: [...] } }
		 *  - Plain sections arrays ({ form: { sections } } / { sections })
		 */
		function normalizeSections(payload) {
			const normalizeTree = (sectionList) =>
				(sectionList ?? []).map((section) => ({
					...section,
					condition_params:
						section.condition_params ?? section.conditions ?? null,
					fields: (section.fields ?? []).map(normalizeField),
					sections: normalizeTree(section.sections),
				}))

			if (payload?.form?.root && payload?.form?.elements) {
				return sectionsFromV2(payload.form)
			}
			if (payload?.formSchema?.root && payload?.formSchema?.elements) {
				return sectionsFromV2(payload.formSchema)
			}
			if (payload?.schema?.root && payload?.schema?.elements) {
				return sectionsFromV2(payload.schema)
			}
			if (Array.isArray(payload?.form?.sections)) {
				return normalizeTree(payload.form.sections)
			}
			if (Array.isArray(payload?.formSchema?.form_schema)) {
				return normalizeTree(payload.formSchema.form_schema)
			}
			if (Array.isArray(payload?.formSchema?.sections)) {
				return normalizeTree(payload.formSchema.sections)
			}
			if (Array.isArray(payload?.schema?.sections)) {
				return normalizeTree(payload.schema.sections)
			}
			if (Array.isArray(payload?.sections)) {
				return normalizeTree(payload.sections)
			}
			return []
		}

		/**
		 * Seed the form's data object: field defaults → attendee prefill →
		 * resume session data (resume wins).
		 */
		function seedFormData() {
			const data = formData.value
			for (const field of allElements()) {
				if (data[field.slug] === undefined) {
					data[field.slug] = field.default_value ?? ""
				}
			}
			if (prefillData.value && typeof prefillData.value === "object") {
				Object.assign(data, prefillData.value)
			}
			if (resumeSession.value?.form_data) {
				Object.assign(data, resumeSession.value.form_data)
			}
		}

		/**
		 * @param {object} payload - show/definition payload (props, JSON, or
		 *   the manifest's `form` section)
		 * @param {object} [options]
		 * @param {boolean} [options.conditions] - enable conditional processing
		 * @param {object} [options.data] - external data object to adopt (by reference)
		 */
		function initialize(payload = {}, options = {}) {
			slug.value = payload.slug ?? payload.formId ?? slug.value ?? formKey
			formName.value =
				payload.form?.name ?? payload.formSchema?.name ?? formName.value
			description.value =
				payload.form?.description ?? payload.formSchema?.description ?? ""
			sections.value = normalizeSections(payload)
			settings.value = payload.settings ?? settings.value
			strings.value = payload.strings ?? strings.value
			registrationMode.value =
				payload.registrationMode ??
				payload.settings?.registration_mode ??
				registrationMode.value
			isAuthenticated.value = !!(
				payload.isAuthenticated ?? isAuthenticated.value
			)
			resumeSession.value = payload.resumeSession ?? resumeSession.value
			prefillData.value = payload.prefillData ?? prefillData.value ?? {}
			customSettings.value =
				payload.customSettings ?? payload.pluginVars ?? customSettings.value
			mockResponses.value = payload.mockResponses ?? mockResponses.value ?? {}

			if (options.data && typeof options.data === "object") {
				formData.value = options.data
			}
			if (options.conditions !== undefined) {
				conditionsEnabled.value = !!options.conditions
			} else if (payload.conditions !== undefined) {
				conditionsEnabled.value = !!payload.conditions
			}

			seedFormData()
			isInitialized.value = true
		}

		function setConditionalProcessing(enabled) {
			conditionsEnabled.value = !!enabled
		}

		// ------------------------------------------------------------------
		// Schema helpers
		// ------------------------------------------------------------------

		function conditionsFor(node) {
			return node?.condition_params ?? node?.conditions ?? null
		}

		function isVisible(node) {
			if (!conditionsEnabled.value) return true
			const conditions = conditionsFor(node)
			const rules = Array.isArray(conditions) ? conditions : conditions?.rules
			if (!rules || rules.length === 0) return true
			// passConditionParams expects {name, logic, value}; the v2 builder
			// stores the target slug under `field` on some rules.
			const normalized = rules.map((rule) =>
				rule.name || rule.column || rule.conditionParams
					? rule
					: { ...rule, name: rule.field },
			)
			return passConditionParams(
				normalized,
				formData.value,
				conditions?.logic ?? conditions?.conditionGroupLogic ?? "AND",
			)
		}

		function allElements() {
			const elements = []
			const walk = (sectionList) => {
				for (const section of sectionList ?? []) {
					for (const field of section.fields ?? []) {
						elements.push(field)
					}
					if (section.sections?.length) walk(section.sections)
				}
			}
			walk(sections.value)
			return elements
		}

		/**
		 * Sections of the form. With conditional processing enabled, hidden
		 * sections are dropped and each section's fields are filtered.
		 */
		function getSections() {
			if (!conditionsEnabled.value) return sections.value

			const filter = (sectionList) =>
				(sectionList ?? []).filter(isVisible).map((section) => ({
					...section,
					fields: (section.fields ?? []).filter(isVisible),
					sections: filter(section.sections),
				}))

			return filter(sections.value)
		}

		/**
		 * Flat list of the form's elements/fields (visible ones when
		 * conditional processing is enabled).
		 */
		function getElements() {
			const elements = allElements()
			if (!conditionsEnabled.value) return elements
			return elements.filter(isVisible)
		}

		function getElement(fieldSlug) {
			return allElements().find((field) => field.slug === fieldSlug) ?? null
		}

		// The processed schema object: sections with conditions applied.
		const schema = computed(() => ({
			name: formName.value,
			slug: slug.value,
			sections: getSections(),
		}))

		// ------------------------------------------------------------------
		// Data helpers
		// ------------------------------------------------------------------

		function getData() {
			return formData.value
		}

		function getValue(fieldSlug) {
			return formData.value[fieldSlug]
		}

		function setValue(fieldSlug, value) {
			formData.value[fieldSlug] = value
			if (errors.value[fieldSlug]) {
				delete errors.value[fieldSlug]
			}
		}

		function setData(values = {}) {
			Object.assign(formData.value, values)
		}

		// ------------------------------------------------------------------
		// Validation (client-side mirror of the server's field rules)
		// ------------------------------------------------------------------

		const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		const PHONE_RE = /^[+]?[\d\s\-().]+$/

		function isEmpty(value) {
			return (
				value === undefined ||
				value === null ||
				value === "" ||
				(Array.isArray(value) && value.length === 0)
			)
		}

		function typeError(field, value) {
			switch (field.type) {
				case "email":
					return EMAIL_RE.test(String(value))
						? null
						: "Please enter a valid email address."
				case "phone":
					return PHONE_RE.test(String(value))
						? null
						: "Please enter a valid phone number."
				case "number":
					return Number.isNaN(Number(value))
						? "Please enter a valid number."
						: null
				default:
					return null
			}
		}

		// Supported Laravel-style string rules from field.validation_rules.
		// Unknown rules are ignored (the server remains authoritative).
		function ruleError(field, rule, value) {
			const [name, arg] = String(rule).split(/:(.+)/)
			switch (name) {
				case "required":
					return isEmpty(value) ? `${field.label} is required.` : null
				case "email":
					return EMAIL_RE.test(String(value))
						? null
						: "Please enter a valid email address."
				case "numeric":
					return Number.isNaN(Number(value))
						? "Please enter a valid number."
						: null
				case "min": {
					const min = Number(arg)
					if (field.type === "number" || !Number.isNaN(Number(value))) {
						return Number(value) < min ? `Must be at least ${min}.` : null
					}
					return String(value).length < min
						? `Must be at least ${min} characters.`
						: null
				}
				case "max": {
					const max = Number(arg)
					if (field.type === "number" || !Number.isNaN(Number(value))) {
						return Number(value) > max ? `Must be at most ${max}.` : null
					}
					return String(value).length > max
						? `Must be at most ${max} characters.`
						: null
				}
				case "in": {
					const allowed = String(arg ?? "")
						.split(",")
						.map((s) => s.trim())
					return allowed.includes(String(value))
						? null
						: "Please select a valid option."
				}
				case "regex": {
					const match = String(arg ?? "").match(/^\/(.*)\/([a-z]*)$/)
					try {
						const re = match
							? new RegExp(match[1], match[2])
							: new RegExp(String(arg))
						return re.test(String(value)) ? null : "Invalid format."
					} catch {
						return null
					}
				}
				default:
					return null
			}
		}

		/**
		 * Validate a single field. Returns the error message or null, and
		 * records it in `errors`.
		 */
		function validateField(fieldSlug) {
			const field = getElement(fieldSlug)
			if (!field) return null
			if (conditionsEnabled.value && !isVisible(field)) {
				delete errors.value[fieldSlug]
				return null
			}

			const value = formData.value[fieldSlug]
			let error = null

			if (field.required && isEmpty(value)) {
				error = `${field.label || fieldSlug} is required.`
			} else if (!isEmpty(value)) {
				error = typeError(field, value)
				if (!error && Array.isArray(field.validation_rules)) {
					for (const rule of field.validation_rules) {
						error = ruleError(field, rule, value)
						if (error) break
					}
				}
			}

			if (error) {
				errors.value[fieldSlug] = error
			} else {
				delete errors.value[fieldSlug]
			}
			return error
		}

		/**
		 * Validate the entire form. Populates `errors`, returns true when valid.
		 */
		function validateForm() {
			errors.value = {}
			for (const field of getElements()) {
				validateField(field.slug)
			}
			return Object.keys(errors.value).length === 0
		}

		const isValid = computed(() => Object.keys(errors.value).length === 0)

		// ------------------------------------------------------------------
		// Submission — dev transport
		// ------------------------------------------------------------------

		function emitDevEvent(kind, payload, result) {
			const detail = { form: slug.value, kind, payload, result }
			console.log(`[GxP Form Store] ${kind}:`, JSON.stringify(detail, null, 2))
			if (typeof window !== "undefined" && window.dispatchEvent) {
				window.dispatchEvent(new CustomEvent("gxp:form-submit", { detail }))
			}
		}

		function apiUrl(pathSuffix = "") {
			const base = String(customSettings.value?.apiBaseUrl ?? "").replace(
				/\/$/,
				"",
			)
			if (!base) return null
			const projectId = customSettings.value?.projectId || "team/project"
			return `${base}/v1/projects/${projectId}/registration-forms/${encodeURIComponent(
				slug.value,
			)}${pathSuffix}`
		}

		function simulatedResult(kind) {
			if (kind === "saveProgress") {
				return {
					success: true,
					simulated: true,
					session_token: "dev-resume-token",
				}
			}
			return {
				success: true,
				simulated: true,
				status: "created",
				message: "Simulated submission (no API endpoint available in dev).",
				attendee_id: "dev-attendee-001",
				redirect_url: null,
			}
		}

		/**
		 * Deliver a payload: manifest mock response → real API POST →
		 * simulated fallback. Rethrows real API errors (409/422/...) so the
		 * caller maps them exactly like the platform store does.
		 */
		async function deliver(kind, pathSuffix, payload) {
			const mock = mockResponses.value?.[kind]
			if (mock !== undefined && mock !== null) {
				emitDevEvent(kind, payload, mock)
				return typeof mock === "object" ? { ...mock } : mock
			}

			const url = apiUrl(pathSuffix)
			if (url) {
				try {
					const response = await axios.post(url, payload, {
						headers: WEB_HEADERS,
					})
					emitDevEvent(kind, payload, response.data)
					return response.data
				} catch (error) {
					const status = error.response?.status
					if (status && status !== 404) {
						throw error
					}
					console.warn(
						`[GxP Form Store] ${kind} endpoint unavailable (${
							status ?? error.message
						}) — returning simulated result`,
					)
				}
			}

			const result = simulatedResult(kind)
			emitDevEvent(kind, payload, result)
			return result
		}

		function handleSubmitError(error) {
			if (error.response?.status === 409 && error.response?.data?.duplicate) {
				lastResult.value = error.response.data
				return error.response.data
			}
			if (error.response?.status === 422) {
				errors.value = Object.fromEntries(
					Object.entries(error.response.data.errors || {}).map(
						([field, messages]) => [
							field,
							Array.isArray(messages) ? messages[0] : messages,
						],
					),
				)
				lastResult.value = { success: false, errors: errors.value }
				return lastResult.value
			}
			lastResult.value = {
				success: false,
				message: error.response?.data?.message || "An error occurred.",
			}
			return lastResult.value
		}

		/**
		 * Submit the form. Handles create and self-update (the platform
		 * branches on registration_mode + session; in dev the result comes
		 * from mockResponses.submit, the mock/real API, or a simulation).
		 *
		 * @param {object} [extra] - extra payload keys (access_code,
		 *   _update_existing, _existing_attendee_id, ...)
		 * @param {object} [options]
		 * @param {boolean} [options.validate=true] - run client validation first
		 * @returns {Promise<object>} the result payload
		 */
		async function submit(extra = {}, options = {}) {
			if ((options.validate ?? true) && !validateForm()) {
				return { success: false, errors: errors.value }
			}

			processing.value = true
			try {
				const payload = { ...formData.value, ...extra }
				if (resumeSession.value?.session_token && !payload._resume_token) {
					payload._resume_token = resumeSession.value.session_token
				}
				const result = await deliver("submit", "/submit", payload)
				lastResult.value = result
				if (result?.success) {
					submitted.value = true
				}
				if (result?.errors && typeof result.errors === "object") {
					errors.value = Object.fromEntries(
						Object.entries(result.errors).map(([field, messages]) => [
							field,
							Array.isArray(messages) ? messages[0] : messages,
						]),
					)
				}
				return result
			} catch (error) {
				return handleSubmitError(error)
			} finally {
				processing.value = false
			}
		}

		/**
		 * Explicitly update an existing registration after a duplicate prompt.
		 */
		async function confirmUpdateExisting(attendeeId, extra = {}) {
			return submit(
				{
					...extra,
					_update_existing: true,
					_existing_attendee_id: attendeeId,
				},
				{ validate: false },
			)
		}

		/**
		 * Save progress for resumable forms.
		 */
		async function saveProgress(contactValue) {
			const result = await deliver("saveProgress", "/save-progress", {
				form_data: formData.value,
				contact_value: contactValue,
			})
			if (result?.session_token) {
				resumeSession.value = {
					...(resumeSession.value || {}),
					session_token: result.session_token,
				}
			}
			return result
		}

		function reset() {
			formData.value = {}
			errors.value = {}
			submitted.value = false
			lastResult.value = null
			seedFormData()
		}

		return {
			// State
			isInitialized,
			slug,
			formName,
			description,
			sections,
			settings,
			strings,
			registrationMode,
			isAuthenticated,
			resumeSession,
			prefillData,
			customSettings,
			mockResponses,
			formData,
			errors,
			processing,
			submitted,
			lastResult,
			conditionsEnabled,
			schema,
			isValid,

			// Lifecycle
			initialize,
			reset,
			setConditionalProcessing,

			// Schema helpers
			getSections,
			getElements,
			getElement,

			// Data helpers
			getData,
			getValue,
			setValue,
			setData,

			// Validation
			validateField,
			validateForm,

			// Submission
			submit,
			confirmUpdateExisting,
			saveProgress,
		}
	})

	const storeInstance = store()
	formStoreRegistry.set(storeId, storeInstance)
	return storeInstance
}
