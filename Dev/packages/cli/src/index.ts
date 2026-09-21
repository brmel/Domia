#!/usr/bin/env node
import './quiet.js'; // must be first: silences node:sqlite's experimental warning
import { Command } from 'commander';
import { doctor } from './commands/doctor.js';
import { mcpServe } from './commands/mcp.js';
import { audit } from './commands/audit.js';
import { toolsInvoke } from './commands/tools.js';
import { agentSmoke } from './commands/agent.js';
import { run, replay } from './commands/run.js';
import { caseAdd, caseList, caseShow, caseMount } from './commands/case.js';
import { runsList, runsShow } from './commands/runs.js';
import { planShow } from './commands/plan.js';
import { memoryList, memoryAdd } from './commands/memory.js';
import { skillList, skillShow } from './commands/skill.js';
import { scheduleCreate, scheduleList, scheduleRemove } from './commands/schedule.js';
import { settingsGet, settingsSet } from './commands/settings.js';
import { traceShow } from './commands/trace.js';

const program = new Command();
program.name('domia').description('DOMIA — LLM agent that drives real apps').version('2.0.0-beta.1');

program
  .command('doctor')
  .description('check the environment is ready')
  .option('--json', 'machine-readable output', false)
  .action(async (opts: { json: boolean }) => {
    process.exitCode = await doctor(opts.json);
  });

const tools = program.command('tools').description('inspect and drive tools');
tools
  .command('invoke <url>')
  .description('open a web page via playwright-mcp, observe it, optionally run steps (e.g. --steps click:e6)')
  .option('--steps <steps>', 'comma-separated steps like click:e6', '')
  .action(async (url: string, opts: { steps: string }) => {
    process.exitCode = await toolsInvoke(url, { steps: opts.steps });
  });

const agent = program.command('agent').description('agent providers');
agent
  .command('smoke')
  .description('scripted propose-only exchange against a real model')
  .option('--model <model>', 'provider:model', 'google:gemini-2.5-flash')
  .action(async (opts: { model: string }) => {
    process.exitCode = await agentSmoke(opts.model);
  });

const caseCmd = program.command('case').description('manage cases (target + assets)');
caseCmd.command('add <name>').description('create a web case').requiredOption('--url <url>', 'target url').option('--tags <tags>', 'comma-separated tags')
  .action(async (name: string, opts: { url: string; tags?: string }) => { process.exitCode = await caseAdd(name, opts); });
caseCmd.command('list').description('list cases').option('--json', '', false)
  .action(async (opts: { json: boolean }) => { process.exitCode = await caseList(opts.json); });
caseCmd.command('mount <id>')
  .description('mount an MCP server onto a case (crawl4ai, github, …) — tools become <name>.*')
  .requiredOption('--name <name>', 'mount name, used as the tool prefix')
  .option('--sse <url>', 'SSE endpoint (crawl4ai: http://localhost:11235/mcp/sse)')
  .option('--http <url>', 'streamable-http endpoint')
  .option('--stdio <cmd>', 'stdio command, e.g. "npx -y @modelcontextprotocol/server-github"')
  .option('--risk <risk>', 'safe|guarded|dangerous (default guarded)')
  .action(async (id: string, o: { name: string; sse?: string; http?: string; stdio?: string; risk?: string }) => {
    process.exitCode = await caseMount(id, o);
  });
caseCmd.command('show <id>').description('show a case').option('--json', '', false)
  .action(async (id: string, opts: { json: boolean }) => { process.exitCode = await caseShow(id, opts.json); });

program
  .command('run <request>')
  .description('autonomous run against a case (or an ad-hoc one from --url)')
  .option('--case <id>', 'case id')
  .option('--url <url>', 'ad-hoc web target (creates a case)')
  .option('--electron <appPath>', 'ad-hoc electron target: path to the app (creates a case)')
  .option('--model <chain>', 'provider:model[,provider:model…] — later entries are failover (R7)', 'google:gemini-2.5-flash')
  .option('--max-turns <n>', 'turn ceiling', '24')
  .option('--no-questions', 'remove user.ask (unattended)')
  .option('--approvals <mode>', 'off|dangerous', 'off')
  .action(async (request: string, opts: { case?: string; url?: string; electron?: string; model: string; maxTurns: string; questions: boolean; approvals: string }) => {
    process.exitCode = await run(request, opts);
  });

program
  .command('audit <url>')
  .description('audit a website across the 12 dimensions — scores, findings with evidence, and fixes')
  .option('--model <chain>', 'provider:model[,provider:model…]', 'google:gemini-2.5-flash')
  .option('--max-turns <n>', 'turn ceiling', '40')
  .option('--dimensions <list>', 'comma-separated subset, e.g. files,seo,agentic')
  .option('--request <text>', 'override the audit brief')
  .option('--sweep-only', 'deterministic pass only — no model, no browser', false)
  .option('--json', 'machine-readable output', false)
  .action(async (url: string, opts: { model: string; maxTurns: string; dimensions?: string; request?: string; sweepOnly: boolean; json: boolean }) => {
    process.exitCode = await audit(url, opts);
  });

program
  .command('mcp')
  .description('serve Domia to an MCP host over stdio (E6) — mount it in Claude Code, Codex, another Domia')
  .action(async () => {
    process.exitCode = await mcpServe();
  });

program
  .command('replay <runId>')
  .description('re-drive a past run from its recorded tape (tools re-execute; decisions do not)')
  .action(async (runId: string) => { process.exitCode = await replay(runId); });

const runsCmd = program.command('runs').description('run history');
runsCmd.command('list').description('list recent runs').option('--json', '', false)
  .action(async (opts: { json: boolean }) => { process.exitCode = await runsList(opts.json); });
runsCmd.command('show <id>').description('show a run + its spans').option('--json', '', false)
  .action(async (id: string, opts: { json: boolean }) => { process.exitCode = await runsShow(id, opts.json); });

const memCmd = program.command('memory').description("what the agent remembers about a case");
memCmd.command('list <caseId>').description('list memories').option('--json', '', false)
  .action(async (caseId: string, o: { json: boolean }) => { process.exitCode = await memoryList(caseId, o.json); });
memCmd.command('add <caseId> <title>').description('teach the agent something durable')
  .requiredOption('--text <text>', 'what to remember').option('--tags <tags>', 'comma-separated')
  .action(async (caseId: string, title: string, o: { text: string; tags?: string }) => { process.exitCode = await memoryAdd(caseId, title, o); });

const planCmd = program.command('plan').description("the agent's living plan");
planCmd.command('show <runId>').description("show a run's plan")
  .option('--json', '', false)
  .action(async (runId: string, opts: { json: boolean }) => { process.exitCode = await planShow(runId, opts.json); });

const skillCmd = program.command('skill').description('reusable SKILL.md recipes');
skillCmd.command('list').description('list skills').option('--json', '', false)
  .action(async (o: { json: boolean }) => { process.exitCode = await skillList(o.json); });
skillCmd.command('show <name>').description('show a skill body').option('--json', '', false)
  .action(async (name: string, o: { json: boolean }) => { process.exitCode = await skillShow(name, o.json); });

const schedCmd = program.command('schedule').description('cron-scheduled unattended runs (R5)');
schedCmd.command('create <caseId> <cron> <request>').description('cron: @every <n>s|m|h|d, @hourly, @daily')
  .action(async (caseId: string, cron: string, request: string) => { process.exitCode = await scheduleCreate(caseId, cron, request); });
schedCmd.command('list').description('list schedules').option('--json', '', false)
  .action(async (o: { json: boolean }) => { process.exitCode = await scheduleList(o.json); });
schedCmd.command('rm <id>').description('remove a schedule')
  .action(async (id: string) => { process.exitCode = await scheduleRemove(id); });

const setCmd = program.command('settings').description('app settings');
setCmd.command('get').description('show settings').option('--json', '', false)
  .action(async (o: { json: boolean }) => { process.exitCode = await settingsGet(o.json); });
setCmd.command('set <key> <value>').description('set a setting')
  .action(async (key: string, value: string) => { process.exitCode = await settingsSet(key, value); });

program.command('trace <runId>').description("a run's timeline (spans, exchanges, artifacts)")
  .option('--json', '', false)
  .action(async (runId: string, opts: { json: boolean }) => { process.exitCode = await traceShow(runId, opts.json); });

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(3);
});
