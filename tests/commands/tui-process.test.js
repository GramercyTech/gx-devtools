import { beforeEach, afterEach, describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
let root
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "gxp-tui-qa-"))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
function run(source) {
	return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
		cwd: root,
		env: { ...process.env, PATH: root },
		encoding: "utf8",
		timeout: 10000,
	})
}
const managerUrl = pathToFileURL(
	path.resolve("dist/tui/services/ServiceManager.js"),
).href
const aiUrl = pathToFileURL(path.resolve("dist/tui/services/AIService.js")).href
describe("compiled TUI process security", () => {
	it("preserves service arguments, clears completed pids, and never cleans up by shared port", () => {
		fs.writeFileSync(
			path.join(root, "lsof"),
			`#!${process.execPath}\nrequire('node:fs').writeFileSync('unrelated-cleanup','called')`,
			{ mode: 0o755 },
		)
		const literal = 'quoted " value; $(touch injected)'
		const result =
			run(`import {serviceManager as manager} from ${JSON.stringify(managerUrl)};
const state=manager.start({id:'fixture',name:'fixture',command:process.execPath,args:['-e','console.log(process.argv[1])',${JSON.stringify(literal)}],cwd:process.cwd()});
await new Promise(resolve=>state.process.once('close',resolve));
manager.forceStopAll();console.log(JSON.stringify({pid:state.pid??null,logs:state.logs}));process.exit(0);`)
		expect(result.status, result.stderr).toBe(0)
		const record = JSON.parse(result.stdout.trim())
		expect(record.pid).toBeNull()
		expect(record.logs.some((log) => log.includes(literal))).toBe(true)
		expect(fs.existsSync(path.join(root, "unrelated-cleanup"))).toBe(false)
		expect(fs.existsSync(path.join(root, "injected"))).toBe(false)
	})
	it("escalates when a direct child ignores SIGTERM despite kill having been sent", () => {
		const result =
			run(`import {serviceManager as manager} from ${JSON.stringify(managerUrl)};
const state=manager.start({id:'stubborn',name:'stubborn',command:process.execPath,args:['-e',"process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],cwd:process.cwd()});
const child=state.process;
await new Promise(resolve=>child.stdout.once('data',resolve));
const originalKill=process.kill;
process.kill=(pid,signal)=>{if(pid<0) throw Object.assign(new Error('group unavailable'),{code:'ESRCH'});return originalKill(pid,signal)};
const stopped=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
manager.stop('stubborn');
console.log(JSON.stringify({sent:child.killed,...await stopped}));process.kill=originalKill;process.exit(0);`)
		expect(result.status, result.stderr).toBe(0)
		expect(JSON.parse(result.stdout.trim())).toEqual({
			sent: true,
			code: null,
			signal: "SIGKILL",
		})
	}, 12000)

	it("keeps noninteractive scaffold prompts out of the shell", () => {
		for (const name of ["claude", "codex", "gemini"])
			fs.writeFileSync(
				path.join(root, name),
				`#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync('scaffold-args.jsonl',JSON.stringify(process.argv.slice(2))+'\\n');console.log(JSON.stringify({files:[]}))`,
				{ mode: 0o755 },
			)
		const modulePath = path.resolve("bin/lib/utils/ai-scaffold.js")
		const prompt = 'quoted "value"; $(touch injected) and `touch injected`'
		const result =
			run(`import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);const {AI_PROVIDERS}=require(${JSON.stringify(modulePath)});
for(const name of ['claude','codex','gemini']) await AI_PROVIDERS[name].generate(${JSON.stringify(prompt)},'fixture','description','cli');`)
		expect(result.status, result.stderr).toBe(0)
		const lines = fs
			.readFileSync(path.join(root, "scaffold-args.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map(JSON.parse)
		expect(lines).toHaveLength(3)
		for (const args of lines) expect(args.at(-1)).toContain(prompt)
		expect(lines[1].slice(0, -1)).toEqual([
			"exec",
			"--sandbox",
			"read-only",
			"--color",
			"never",
			"--skip-git-repo-check",
			"--",
		])
		expect(fs.existsSync(path.join(root, "injected"))).toBe(false)
	})

	it("passes AI prompts literally for each local CLI without executing prompt text", () => {
		for (const name of ["claude", "codex", "gemini"])
			fs.writeFileSync(
				path.join(root, name),
				`#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2)))`,
				{ mode: 0o755 },
			)
		const prompt = 'Explain "quotes"; $(touch injected) and `touch injected`'
		const result = run(`import {AIService} from ${JSON.stringify(aiUrl)};
const instance=Object.create(AIService.prototype); instance.conversationHistory=[];
for(const method of ['sendWithClaude','sendWithCodex','sendWithGeminiCli']) console.log(await instance[method](${JSON.stringify(prompt)},''));`)
		expect(result.status, result.stderr).toBe(0)
		const lines = result.stdout.trim().split("\n").map(JSON.parse)
		expect(lines).toHaveLength(3)
		for (const args of lines) expect(args.at(-1)).toBe(prompt)
		expect(lines[1].slice(0, -1)).toEqual([
			"exec",
			"--sandbox",
			"read-only",
			"--color",
			"never",
			"--skip-git-repo-check",
			"--",
		])
		expect(fs.existsSync(path.join(root, "injected"))).toBe(false)
	})
})
