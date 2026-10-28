import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import express from "express"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { createLiveQuizRouter } = require("../../runtime/mock-api/live-quiz.js")

describe("live quiz mock (EZ-3311, EZ-3329)", () => {
	let server
	let base
	let io

	beforeEach(async () => {
		const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gx-live-quiz-"))
		fs.writeFileSync(
			path.join(projectRoot, "app-manifest.json"),
			JSON.stringify({
				liveQuiz: {
					form_id: 7,
					questions: [
						{
							id: 12,
							label: "Pick the next songs",
							quiz_question_type: "multiple_choice",
							options: [
								{ label: "Song A", value: "101", secondary: "Artist A" },
								{ label: "Song B", value: "102", secondary: "Artist B" },
								{ label: "Song C", value: "103", secondary: "Artist C" },
							],
							max_selections: 2,
						},
					],
				},
			}),
		)
		io = { emit: vi.fn() }
		const app = express()
		app.use("/api", createLiveQuizRouter(io, { projectRoot }))
		server = await new Promise((resolve) => {
			const s = app.listen(0, () => resolve(s))
		})
		base = `http://127.0.0.1:${server.address().port}/api/v1/projects/t/p/quiz/jukebox`
	})

	afterEach(() => server.close())

	const post = (pathname, body = {}, headers = {}) =>
		fetch(`${base}/${pathname}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...headers },
			body: JSON.stringify(body),
		})

	it("runs a round: send with a round limit, vote, tally per option, unsend", async () => {
		const state = await (await fetch(`${base}/manage/state`)).json()
		expect(state.form_id).toBe(7)

		await post("manage/live/open")
		const sent = await (
			await post("manage/questions/send", {
				question_ids: [12],
				max_selections: 1,
			})
		).json()
		expect(sent.live_state.question_windows[0].max_selections).toBe(1)
		expect(io.emit).toHaveBeenCalledWith(
			"trigger_state.changed",
			expect.objectContaining({ form_id: 7, event_type: "live.state.updated" }),
		)

		const tooMany = await post("answer", {
			element_id: "12",
			answer: ["101", "102"],
		})
		expect(tooMany.status).toBe(422)
		expect((await tooMany.json()).error).toBe("Pick one option.")

		const notASong = await post("answer", { element_id: "12", answer: ["999"] })
		expect((await notASong.json()).error).toBe(
			"That answer is not one of the options.",
		)

		await post(
			"answer",
			{ element_id: "12", answer: ["101"] },
			{ "X-Mock-Attendee": "a" },
		)
		await post(
			"answer",
			{ element_id: "12", answer: ["101"] },
			{ "X-Mock-Attendee": "b" },
		)
		expect(io.emit).toHaveBeenCalledWith(
			"analytics.updated",
			expect.objectContaining({
				form_id: 7,
				question_id: 12,
				answer_distribution: { 101: 2 },
			}),
		)

		await post("manage/questions/unsend", { question_ids: [12] })
		const analytics = await (
			await fetch(`${base}/manage/analytics?question_id=12`)
		).json()
		expect(analytics.analytics[0].total_responses).toBe(2)
		expect(analytics.analytics[0].window.status).toBe("closed")
	})

	it("keeps closed rounds on close and wipes them on reset", async () => {
		await post("manage/questions/send", { question_ids: [12] })
		const closed = await (await post("manage/live/close")).json()
		expect(closed.live_state.closed_question_windows).toHaveLength(1)

		const reset = await (await post("manage/live/reset")).json()
		expect(reset.live_state.closed_question_windows).toHaveLength(0)
		expect(reset.live_state.live_mode).toBe("inactive")
	})
})
