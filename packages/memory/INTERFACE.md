# @domia/memory — Interface Spec

**Purpose.** Cross-run learned facts, per case. Markdown memories the agent saves
and recalls; **selectively injected** at run start so the toolset/prompt never
balloons (OpenClaw + Agent-S lesson, R3).

**Kind.** K1 service + belt.

---

## Public interfaces (contracts `memory.ts`)

```ts
export interface MemoryService {                           // EP.MemoryService (one)
  relevant(caseId: CaseId, request: string): Promise<ModuleResult<readonly MemoryCard[]>>;  // run-start injection
  toolManifests(caseId: CaseId): readonly ToolManifest[]; // sync — the memory.* belt
  dispatch(caseId: CaseId, call: ToolCall): Promise<ModuleResult<Outcome<ToolOutput>>>;
}
export interface MemoryCard {
  readonly id: MemoryId; readonly title: string;
  readonly tags: readonly string[]; readonly body: string; readonly updatedAt: string;
}
```

## `memory.*` toolset

`memory.save {title, text, tags}` · `memory.recall {query}` · `memory.list {}` —
mid-run recall for the agent, complementing the run-start injection.

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `MemoryModule` / `MemoryServiceImpl` | `module.ts` `service.ts` | orchestrates store index + md bodies |
| `MemoryStore` | `files.ts` | bodies at `~/.domia/memory/<caseId>/<id>.md`; index via `EP.Store` `MemoryRepo` |
| `MemoryToolBelt` | `tools.ts` | `memory.*` manifests + dispatch |
| `RelevanceSelector` | `select.ts` | ranks memories by case tags + request term overlap; returns top-K cards (keyword v1; embedding hook later) |

## Design notes

- **Selective injection is the whole point.** `relevant()` returns a *small* set
  the loop seeds into the lead persona's context; the full corpus is reachable only
  via `memory.recall`. Keeps prompt lean, model sharp.
- **Portable & inspectable.** Memories are plain markdown files a human can read
  and edit (UI memory tab, J-set) — same ethos as Agent Skills.
- **Provider seam.** `RelevanceSelector` is swappable; a future `mem0`/embedding
  backend implements the same `MemoryService` without touching the belt.

## File manifest

```
memory/
  package.json  tsconfig.json
  src/ module.ts service.ts files.ts tools.ts select.ts index.ts
```
