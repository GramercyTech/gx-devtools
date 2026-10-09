import { test } from "vitest"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
const loadModule = createRequire(import.meta.url)
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
const source = fs.readFileSync(
	fileURLToPath(new URL("../../mcp/lib/api-tools.js", import.meta.url)),
	"utf8",
)
const operationId = "portal.v1.project.groups.attendees.index"
function fixture() {
	return {
		paths: {
			"/groups/{group}/attendees": {
				get: {
					operationId,
					tags: ["AttendeeGroup"],
					"x-model": { name: "Attendee" },
					"x-relation": {
						parent_model: { name: "Group" },
						parent_parameter: "group",
						parent_permission_key: "group",
					},
					"x-permission": [
						{ permission: "view_groups", permission_key: "group" },
						{ permission: "view_attendees", permission_key: "attendee" },
					],
				},
			},
		},
	}
}
function load(spec) {
	let writes = 0
	const module = { exports: {} }
	vm.runInNewContext(source, {
		module,
		process,
		require(name) {
			if (name === "./specs") return { fetchSpec: async () => spec }
			if (name === "fs")
				return {
					existsSync: () => false,
					writeFileSync: () => {
						writes++
					},
				}
			return loadModule(name)
		},
	})
	return { generate: module.exports.generateDependency, writes: () => writes }
}
const args = {
	identifier: "groups",
	tag: "AttendeeGroup",
	operationIds: [operationId],
}
const op = (spec) => spec.paths["/groups/{group}/attendees"].get

test("relation uses parent binding and complete string permissions", async () => {
	const tools = load(fixture())
	const result = await tools.generate(args)
	assert.equal(result.ok, true)
	assert.equal(result.dependency.model, "Group")
	assert.equal(result.dependency.permissionKey, "group")
	assert.deepEqual(Array.from(result.dependency.permissions), [
		"view_attendees",
		"view_groups",
	])
	assert.equal(
		result.dependency.operations["groups.attendees.index"],
		"get:/groups/{group}/attendees",
	)
	assert.equal(result.wrote, false)
})
test("permission ordering does not change parent binding", async () => {
	const spec = fixture()
	op(spec)["x-permission"].reverse()
	const result = await load(spec).generate(args)
	assert.equal(result.dependency.permissionKey, "group")
})
test("single ordinary model descriptor works", async () => {
	const spec = fixture()
	delete op(spec)["x-relation"]
	op(spec)["x-model"] = { name: "Group" }
	op(spec)["x-permission"] = op(spec)["x-permission"][0]
	const result = await load(spec).generate(args)
	assert.equal(result.ok, true)
	assert.equal(result.dependency.model, "Group")
})
for (const [name, mutate, extra] of [
	[
		"missing parent key",
		(s) => {
			delete op(s)["x-relation"].parent_permission_key
		},
	],
	[
		"unknown parent key",
		(s) => {
			op(s)["x-relation"].parent_permission_key = "project"
		},
	],
	[
		"missing parent model",
		(s) => {
			delete op(s)["x-relation"].parent_model
		},
	],
	[
		"missing route binding",
		(s) => {
			op(s)["x-relation"].parent_parameter = "other"
		},
	],
	[
		"missing permissions",
		(s) => {
			delete op(s)["x-permission"]
		},
	],
	[
		"empty permissions",
		(s) => {
			op(s)["x-permission"] = []
		},
	],
	[
		"flattened permissions without binding contract",
		(s) => {
			op(s)["x-permission"] = ["view_groups"]
		},
	],
	[
		"malformed additional permission",
		(s) => {
			op(s)["x-permission"].push({
				permission: { bad: true },
				permission_key: "group",
			})
		},
	],
	[
		"ambiguous nonrelation keys",
		(s) => {
			delete op(s)["x-relation"]
		},
	],
	[
		"unknown requested operation",
		() => {},
		{ operationIds: [operationId, "nonexistent"] },
	],
	[
		"mixed model bindings",
		(s) => {
			const other = structuredClone(op(s))
			other.operationId = "other"
			other["x-relation"].parent_model.name = "Project"
			s.paths["/other/{group}/attendees"] = { get: other }
		},
		{ operationIds: [] },
	],
	[
		"duplicate operation identity",
		(s) => {
			s.paths["/other/{group}/attendees"] = { get: structuredClone(op(s)) }
		},
		{ operationIds: [] },
	],
]) {
	test(`${name} rejects before manifest write`, async () => {
		const spec = fixture()
		mutate(spec)
		const tools = load(spec)
		const result = await tools.generate({
			...args,
			...extra,
			writeTo: "app-manifest.json",
		})
		assert.equal(result.ok, false)
		assert.equal(tools.writes(), 0)
	})
}
test("valid explicit manifest write contains corrected dependency", async () => {
	const tools = load(fixture())
	const result = await tools.generate({ ...args, writeTo: "app-manifest.json" })
	assert.equal(result.wrote, true)
	assert.equal(tools.writes(), 1)
})

test(
	"regenerated local platform spec supplies the complete binding contract",
	{ skip: !process.env.GXDEV_CONTRACT_SPEC },
	async () => {
		const spec = JSON.parse(
			fs.readFileSync(process.env.GXDEV_CONTRACT_SPEC, "utf8"),
		)
		const result = await load(spec).generate(args)
		assert.equal(result.ok, true, result.error)
		assert.equal(result.dependency.model, "Group")
		assert.equal(result.dependency.permissionKey, "group")
		assert.deepEqual(Array.from(result.dependency.permissions), [
			"view_attendees",
			"view_groups",
		])
	},
)
