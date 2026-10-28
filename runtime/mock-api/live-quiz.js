/**
 * Live quiz mock
 *
 * The OpenAPI-generated routes return random bodies, so the live quiz
 * management endpoints an app page uses to run a quiz
 * (/quiz/{form}/manage/*) and the attendee calls it needs to vote
 * (/quiz/{form}/state, /start, /answer) are mocked by hand, per form, in
 * memory. Changes are relayed the way the platform broadcasts them on the
 * live channels: "trigger_state.changed" ({ form_id, trigger_state,
 * event_type, updated_at }) and "analytics.updated" ({ form_id, question_id,
 * total_responses, correct_responses, answer_distribution, updated_at }).
 *
 * Questions come from the manifest's liveQuiz mock ({ form_id, questions });
 * an id it doesn't list becomes a three-option placeholder. Permissions and
 * bindings aren't checked here, and banks and question editing stay on the
 * generated routes. Each vote is keyed by the X-Mock-Attendee header (default
 * "dev"), so one browser can stand in for several attendees.
 */

const express = require("express")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const BASE = "/v1/projects/:teamSlug/:projectSlug/quiz/:form"

function readLiveQuiz(projectRoot) {
	try {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(projectRoot, "app-manifest.json"), "utf8"),
		)
		return manifest.liveQuiz ?? {}
	} catch {
		return {}
	}
}

function inactiveState() {
	return {
		live_mode: "inactive",
		live_bank_id: null,
		live_question_ids: [],
		questions: [],
		question_windows: [],
		closed_question_windows: [],
		session_status: "no_session",
		session_uuid: null,
		review_question_id: null,
		review_data: null,
		leaderboard_visible: false,
		ignore_keys: [
			"updated_by",
			"initiated_by",
			"admin_analytics",
			"closed_question_windows",
		],
		updated_at: new Date().toISOString(),
	}
}

/**
 * @param {object} io - Socket.IO server instance
 * @param {object} options
 * @param {string} [options.projectRoot] - where app-manifest.json lives
 * @returns {express.Router}
 */
function createLiveQuizRouter(io, { projectRoot = process.cwd() } = {}) {
	const router = express.Router()
	const quizzes = new Map()

	const quizFor = (slug) => {
		if (!quizzes.has(slug)) {
			const mock = readLiveQuiz(projectRoot)
			quizzes.set(slug, {
				formId: mock.form_id ?? 1,
				questions: mock.questions ?? [],
				state: inactiveState(),
				settings: {
					live_mode_enabled: true,
					multi_question_allowed: false,
					default_question_duration: 30,
					late_join_policy: "current_question",
					timeout_behavior: "close",
				},
				// question id => { attendee => values }
				answers: new Map(),
				history: [],
			})
		}
		return quizzes.get(slug)
	}

	const question = (quiz, id) =>
		quiz.questions.find((q) => String(q.id) === String(id)) ?? {
			id: Number(id),
			label: `Question ${id}`,
			quiz_question_type: "multiple_choice",
			options: ["A", "B", "C"].map((label) => ({
				label,
				value: label.toLowerCase(),
			})),
			max_selections: null,
		}

	const eventType = (state) => {
		if (state.live_mode === "inactive") return "live.reset"
		if (state.question_windows.length > 0) return "live.state.updated"
		return "live.waiting"
	}

	const changed = (quiz) => {
		quiz.state.updated_at = new Date().toISOString()
		io?.emit("trigger_state.changed", {
			form_id: quiz.formId,
			trigger_state: quiz.state,
			event_type: eventType(quiz.state),
			updated_at: quiz.state.updated_at,
		})
	}

	const tally = (quiz, questionId) => {
		const byAttendee = quiz.answers.get(String(questionId)) ?? new Map()
		const distribution = {}
		for (const values of byAttendee.values()) {
			for (const value of new Set(values.map(String))) {
				distribution[value] = (distribution[value] ?? 0) + 1
			}
		}
		return {
			total_responses: byAttendee.size,
			correct_responses: 0,
			answer_distribution: distribution,
		}
	}

	const broadcastTally = (quiz, questionId) => {
		io?.emit("analytics.updated", {
			form_id: quiz.formId,
			question_id: Number(questionId),
			...tally(quiz, questionId),
			updated_at: new Date().toISOString(),
		})
	}

	const closeWindows = (quiz, ids) => {
		const now = new Date().toISOString()
		const closing = quiz.state.question_windows.filter((w) =>
			ids.includes(String(w.question_id)),
		)
		quiz.state.question_windows = quiz.state.question_windows.filter(
			(w) => !ids.includes(String(w.question_id)),
		)
		quiz.state.closed_question_windows.push(
			...closing.map((w) => ({ ...w, status: "closed", closed_at: now })),
		)
		quiz.state.live_question_ids = quiz.state.question_windows.map(
			(w) => w.question_id,
		)
		if (
			quiz.state.session_status === "question_active" &&
			quiz.state.question_windows.length === 0
		) {
			quiz.state.session_status = "waiting"
		}
		return closing
	}

	const liveState = (res, quiz, extra = {}) =>
		res.json({ success: true, ...extra, live_state: quiz.state })

	const unprocessable = (res, field, message) =>
		res.status(422).json({ message, errors: { [field]: [message] } })

	// --- Management (app pages) ---

	router.get(`${BASE}/manage/state`, (req, res) => {
		const quiz = quizFor(req.params.form)
		res.json({
			form_id: quiz.formId,
			live_state: quiz.state,
			settings: quiz.settings,
		})
	})

	const openSession = (req, res) => {
		const quiz = quizFor(req.params.form)
		quiz.state.session_uuid = crypto.randomUUID()
		quiz.state.session_status = "waiting"
		quiz.state.live_mode = "active"
		quiz.history.unshift({
			uuid: quiz.state.session_uuid,
			status: "waiting",
			started_at: new Date().toISOString(),
		})
		changed(quiz)
		liveState(res, quiz, {
			session: { uuid: quiz.state.session_uuid, status: "waiting" },
		})
	}
	router.post(`${BASE}/manage/live/open`, openSession)
	router.post(`${BASE}/manage/session/reopen`, openSession)

	router.post(`${BASE}/manage/live/close`, (req, res) => {
		const quiz = quizFor(req.params.form)
		const open = quiz.state.question_windows.map((w) => String(w.question_id))
		closeWindows(quiz, open)
		open.forEach((id) => broadcastTally(quiz, id))
		Object.assign(quiz.state, {
			live_mode: "inactive",
			session_status: "ended",
			review_question_id: null,
			leaderboard_visible: false,
		})
		changed(quiz)
		liveState(res, quiz)
	})

	router.post(`${BASE}/manage/live/reset`, (req, res) => {
		const quiz = quizFor(req.params.form)
		quiz.state = inactiveState()
		quiz.answers.clear()
		changed(quiz)
		liveState(res, quiz)
	})

	router.post(`${BASE}/manage/questions/send`, express.json(), (req, res) => {
		const quiz = quizFor(req.params.form)
		const ids = (req.body?.question_ids ?? []).map(String)
		const duration = Number(
			req.body?.duration ?? quiz.settings.default_question_duration,
		)
		const maxSelections = req.body?.max_selections ?? null

		if (ids.length === 0) {
			return unprocessable(
				res,
				"question_ids",
				"The question ids field is required when bank id is not present.",
			)
		}
		if (
			maxSelections !== null &&
			(!Number.isInteger(maxSelections) || maxSelections < 1)
		) {
			return unprocessable(
				res,
				"max_selections",
				"The max selections field must be at least 1.",
			)
		}

		if (!quiz.settings.multi_question_allowed) {
			const replaced = closeWindows(
				quiz,
				quiz.state.question_windows.map((w) => String(w.question_id)),
			)
			replaced.forEach((w) => broadcastTally(quiz, w.question_id))
		}

		const now = new Date()
		for (const id of ids) {
			const definition = question(quiz, id)
			quiz.answers.delete(String(id))
			quiz.state.question_windows.push({
				question_id: Number(id),
				start_at: now.toISOString(),
				end_at: new Date(now.getTime() + duration * 1000).toISOString(),
				duration,
				status: "active",
				closed_at: null,
				max_selections: maxSelections ?? definition.max_selections ?? null,
			})
			quiz.state.questions = [
				...quiz.state.questions.filter((q) => String(q.id) !== String(id)),
				definition,
			]
		}
		Object.assign(quiz.state, {
			live_mode: "active",
			live_question_ids: quiz.state.question_windows.map((w) => w.question_id),
			session_status: quiz.state.session_uuid
				? "question_active"
				: quiz.state.session_status,
		})
		changed(quiz)
		liveState(res, quiz)
	})

	router.post(`${BASE}/manage/questions/unsend`, express.json(), (req, res) => {
		const quiz = quizFor(req.params.form)
		const ids = (req.body?.question_ids ?? []).map(String)
		closeWindows(quiz, ids)
		ids.forEach((id) => broadcastTally(quiz, id))
		changed(quiz)
		liveState(res, quiz)
	})

	router.get(`${BASE}/manage/analytics`, (req, res) => {
		const quiz = quizFor(req.params.form)
		const windows = req.query.question_id
			? [...quiz.state.question_windows, ...quiz.state.closed_question_windows]
					.filter(
						(w) => String(w.question_id) === String(req.query.question_id),
					)
					.sort((a, b) => b.start_at.localeCompare(a.start_at))
					.slice(0, 1)
			: quiz.state.question_windows
		const analytics = windows.map((window) => ({
			question_id: window.question_id,
			question_label: question(quiz, window.question_id).label,
			...tally(quiz, window.question_id),
			window,
		}))
		res.json({
			analytics,
			total_responses: analytics.reduce(
				(sum, row) => sum + row.total_responses,
				0,
			),
		})
	})

	router.get(`${BASE}/manage/session/history`, (req, res) => {
		res.json({ sessions: quizFor(req.params.form).history })
	})

	router.post(`${BASE}/manage/review/start`, express.json(), (req, res) => {
		const quiz = quizFor(req.params.form)
		quiz.state.review_question_id = Number(req.body?.question_id)
		quiz.state.review_data = {
			question_id: quiz.state.review_question_id,
			analytics: tally(quiz, req.body?.question_id),
		}
		changed(quiz)
		liveState(res, quiz)
	})

	router.post(`${BASE}/manage/review/end`, (req, res) => {
		const quiz = quizFor(req.params.form)
		Object.assign(quiz.state, { review_question_id: null, review_data: null })
		changed(quiz)
		liveState(res, quiz)
	})

	for (const [action, visible] of [
		["show", true],
		["hide", false],
	]) {
		router.post(`${BASE}/manage/leaderboard/${action}`, (req, res) => {
			const quiz = quizFor(req.params.form)
			quiz.state.leaderboard_visible = visible
			changed(quiz)
			liveState(res, quiz)
		})
	}

	router.patch(`${BASE}/manage/settings`, express.json(), (req, res) => {
		const quiz = quizFor(req.params.form)
		const body = req.body ?? {}
		if (body.default_question_duration !== undefined)
			quiz.settings.default_question_duration = body.default_question_duration
		if (body.live_multi_question_allowed !== undefined)
			quiz.settings.multi_question_allowed = Boolean(
				body.live_multi_question_allowed,
			)
		if (body.late_join_policy !== undefined)
			quiz.settings.late_join_policy = body.late_join_policy
		if (body.timeout_behavior !== undefined)
			quiz.settings.timeout_behavior = body.timeout_behavior
		res.json({
			form_id: quiz.formId,
			live_state: quiz.state,
			settings: quiz.settings,
		})
	})

	// --- Attendee side (voting) ---

	const attendeeState = (state) => {
		const { closed_question_windows, ignore_keys, ...rest } = state
		return {
			...rest,
			question_windows: state.question_windows.map(
				({ initiated_by, ...window }) => window,
			),
		}
	}

	router.get(`${BASE}/state`, (req, res) => {
		const quiz = quizFor(req.params.form)
		res.json({
			can_attempt: true,
			active_attempt: { id: 1 },
			live: attendeeState(quiz.state),
		})
	})

	router.post(`${BASE}/start`, (req, res) => {
		res.json({ success: true, attempt: { id: 1 } })
	})

	router.post(`${BASE}/answer`, express.json(), (req, res) => {
		const quiz = quizFor(req.params.form)
		const elementId = String(req.body?.element_id ?? "")
		const window = quiz.state.question_windows.find(
			(w) =>
				String(w.question_id) === elementId ||
				String(question(quiz, w.question_id).element_id) === elementId,
		)
		if (!window) {
			return res
				.status(422)
				.json({ success: false, error: "This question is not live." })
		}

		const definition = question(quiz, window.question_id)
		const values = [
			...new Set(
				(Array.isArray(req.body?.answer)
					? req.body.answer
					: [req.body?.answer]
				).map(String),
			),
		]
		const optionValues = (definition.options ?? []).map((o) => String(o.value))
		const max = window.max_selections ?? definition.max_selections ?? null

		if (values.some((value) => !optionValues.includes(value))) {
			return res.status(422).json({
				success: false,
				error: "That answer is not one of the options.",
			})
		}
		if (max !== null && values.length > max) {
			return res.status(422).json({
				success: false,
				error: max === 1 ? "Pick one option." : `Pick at most ${max} options.`,
			})
		}

		const attendee = req.get("X-Mock-Attendee") ?? "dev"
		const byAttendee = quiz.answers.get(String(window.question_id)) ?? new Map()
		byAttendee.set(attendee, values)
		quiz.answers.set(String(window.question_id), byAttendee)
		broadcastTally(quiz, window.question_id)

		res.json({
			success: true,
			answer: { element_id: elementId, answer_value: values },
		})
	})

	return router
}

module.exports = { createLiveQuizRouter }
