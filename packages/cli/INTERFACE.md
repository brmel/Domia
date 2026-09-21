# @domia/cli — Interface Spec

**Purpose.** Same `DomiaApi`, terminal-shaped. Boots headless in-process by
default, or connects to a running daemon (`--daemon <url>`).

**Kind.** Consumer — exempt from the lifecycle.

---

## Commands (each = one thin file calling one api namespace)

| Command | Api | Notes |
|---|---|---|
| `domia run "<request>" --case <id>\|--url\|--electron [--model a:b[,c:d]] [--no-questions] [--approvals off\|dangerous] [--max-turns n]` | `runs.start` (+ `runs.watch`) | sets `interactive` from TTY+`--watch` (D12); `--model` takes a failover chain (R7, D36) |
| `domia run list \| show <id> \| cancel <id> \| resume <id> \| answer <id> "<text>"` | `runs.*` | |
| `domia plan show <runId> [--follow]` | `plans.get` / `plans.watch` | |
| `domia case add \| list \| show \| validate \| auth <…>` | `cases.*` | `auth` = interactive capture in a headed browser (F7/D36) |
| `domia trace show <runId> [--tree]` | `traces.*` | |
| `domia memory list \| add \| rm --case <id>` | `memories.*` | |
| `domia schedule add \| list \| enable \| disable \| rm` | `schedules.*` | |
| `domia tools list [--target web\|electron\|desktop]` | `tools.catalog` | |
| `domia agent providers \| models <provider>` | `agents.*` | |
| `domia audit <url> [--sweep-only] [--json] [--dimensions <list>] [--model <chain>]` | `AuditService` | 12-dimension audit; `--sweep-only` is the deterministic pass with no model or browser; prints the per-dimension score table (D38/D39) |
| `domia mcp` | — | serves Domia to an MCP host over stdio (E6/J10); logs stay on stderr |
| `domia doctor` | host checks | node/sqlite, playwright-mcp **and its chromium**, keys, prompts, db, trace |

Global flags: `--json` (every command; scripting), `--daemon <url>` (connect to a
headless WS gateway instead of in-process). Exit codes: `0` ok · `1` failed · `2`
cancelled · `3` error.

## Internal structure

| Area | Files | Role |
|---|---|---|
| entry | `index.ts` | commander wiring |
| boot | `boot.ts` | in-process `bootHeadless` or WS client (R8) |
| commands | `commands/{run,case,plan,trace,memory,schedule,tools,agent,doctor,settings}.ts` | argument parsing only |
| render | `render/{lane.ts, planBoard.ts, table.ts, json.ts}` | all output isolated here |

## Design notes

- `--watch` renders the activity lane + plan board in-terminal from the same event
  stream the UI consumes; on `waiting_user` with a TTY it prompts inline and calls
  `runs.answer`. Without a TTY it prints a resume hint (keeps CI non-blocking, D12).
- The CLI is the primary dev surface through slice 5 (UI arrives slice 6).

## File manifest

```
cli/
  package.json  tsconfig.json
  src/
    index.ts boot.ts
    commands/{run.ts, case.ts, plan.ts, trace.ts, memory.ts, schedule.ts,
              tools.ts, agent.ts, doctor.ts, settings.ts}
    render/{lane.ts, planBoard.ts, table.ts, json.ts}
```
