# @domia/plan — Interface Spec

**Purpose.** The living plan — **data + tools, never an engine**. The agent creates
and revises items through `plan.*` tools; UI/CLI render it live; nothing blocks on
it (informants, not vetoes).

**Kind.** K2 factory (`PlanContext`).

---

## Public interfaces (contracts `plan.ts`)

```ts
export interface PlanService {                             // EP.PlanService (one)
  allocContext(runId: RunId, goal: string): Promise<ModuleResult<PlanContext>>;
  get(runId: RunId): Promise<ModuleResult<Plan | null>>;
  history(runId: RunId): Promise<ModuleResult<readonly PlanRevision[]>>;
}
export interface PlanContext extends Context<PlanConfig, PlanState> {
  current(): Plan;                                         // sync in-memory snapshot
  apply(op: PlanOp, origin: 'agent'|'user'): Promise<ModuleResult<PlanRevision>>;   // write-through, emits, traces
  toolManifests(): readonly ToolManifest[];               // sync — the plan.* belt
  dispatch(call: ToolCall): Promise<ModuleResult<Outcome<ToolOutput>>>;             // router target
  onChange(fn: (rev: PlanRevision) => void): Unsubscribe;
  staleness(): Signal | null;                             // active item untouched N turns → signal
}
export interface Plan {
  readonly id: PlanId; readonly runId: RunId; readonly goal: string;
  readonly items: readonly PlanItem[]; readonly revision: number;
  readonly status: 'empty'|'active'|'settled';
}
export interface PlanItem {
  readonly id: ItemId; readonly seq: number;
  readonly title: string; readonly intent: string;        // what "done" means
  readonly status: 'pending'|'active'|'done'|'dropped'; readonly note?: string;
}
export type PlanOp =
  | { op:'propose'; items: { title:string; intent:string }[] }
  | { op:'add';     title:string; intent:string; afterSeq?: number }
  | { op:'start';   itemId: ItemId }
  | { op:'complete';itemId: ItemId; note?: string }
  | { op:'drop';    itemId: ItemId; reason: string }
  | { op:'revise';  ops: PlanOp[] }
  | { op:'note';    text: string };
export interface PlanRevision { readonly revision: number; readonly op: PlanOp; readonly origin: 'agent'|'user'; readonly at: string; readonly diff: PlanDiff }
```

## `plan.*` toolset (offered to the agent)

`plan.propose` · `plan.add_item` · `plan.start_item` · `plan.complete_item` ·
`plan.drop_item` · `plan.revise` · `plan.note` — each maps 1:1 to a `PlanOp` in
`dispatch`.

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `PlanModule` / `PlanServiceImpl` | `module.ts` `service.ts` | alloc + read queries via `EP.Store` |
| `PlanContextImpl` | `context.ts` | holds the in-memory `Plan`; `apply` persists+emits **before returning** |
| `PlanStateMachine` | `ops.ts` | pure `(plan, op) → { plan, diff } | Err(INVALID_ARGS)` — the only place transitions are validated |
| `PlanToolBelt` | `tools.ts` | `plan.*` manifests (Zod args) + `dispatch` → `apply` |
| `StalenessInformant` | `staleness.ts` | tracks last-touch per active item; emits a `plan_stale` signal, never a stop |

## Design notes

- **Guidance, never a cage.** Nothing here can halt a run. `staleness()` returns a
  `Signal` the loop feeds the agent; the agent decides.
- **One-active soft rule.** `start` on a second item is allowed but emits a signal
  — the model self-corrects; the engine doesn't enforce.
- **Audit-complete.** Every op → a `PlanRevision` row; `history` reconstructs the
  whole walk (UI plan history, J8).

## File manifest

```
plan/
  package.json  tsconfig.json
  src/ module.ts service.ts context.ts ops.ts tools.ts staleness.ts index.ts
```
