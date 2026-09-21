# @domia/case — Interface Spec

**Purpose.** The durable definition of a target: how to reach it, authenticate,
what data it needs, which constraints and tool policy inform a run.

**Kind.** K1 service (CRUD, validate, captureAuth) + K2 factory (`CaseContext`).

Incorporates D11 (session factory injected, not imported), R6 (tool policy),
E1 (mcpServers in assets).

---

## Public interfaces (contracts `case.ts`)

```ts
export interface CaseService {                             // EP.CaseService (one)
  create(draft: CaseDraft): Promise<ModuleResult<Case>>;
  get(id: CaseId): Promise<ModuleResult<Case | null>>;
  list(q?: CaseQuery): Promise<ModuleResult<Page<Case>>>;
  update(id: CaseId, patch: CasePatch): Promise<ModuleResult<Case>>;
  archive(id: CaseId): Promise<ModuleResult<void>>;
  validate(id: CaseId): Promise<ModuleResult<Outcome<CaseValidation>>>;
  captureAuth(id: CaseId, sessions: SessionFactory): Promise<ModuleResult<Outcome<AuthCapture>>>;  // D11
  allocContext(id: CaseId): Promise<ModuleResult<CaseContext>>;
}
export type SessionFactory = (target: TargetSpec, opts?: SessionOptions) => Promise<ModuleResult<TargetSession>>;  // D11

export interface Case {
  readonly id: CaseId; readonly name: string;
  readonly target: TargetSpec;
  readonly requestTemplate?: string;                       // {placeholders}
  readonly assets: CaseAssets;
  readonly constraints: readonly Constraint[];             // informants
  readonly toolPolicy: ToolPolicy;                         // R6/F11 allow/deny
  readonly tags: readonly string[];
}
export type TargetSpec =
  | { kind: 'web';      url: string; viewport?: Viewport }
  | { kind: 'electron'; appPath: string; args?: string[]; attach?: { cdpPort: number } }
  | { kind: 'desktop';  app?: string }
  | { kind: 'shell';    cwd: string };
  // deferred (§17, not built): { kind:'container'; image; daemon } for a disposable VM desktop
export interface CaseAssets {
  readonly authState?: SecretRef;                          // encrypted storageState
  readonly env?: Readonly<Record<string, SecretRef | string>>;
  readonly files?: readonly ArtifactRef[];
  readonly mcpServers?: readonly McpMount[];               // E1
}
export interface McpMount {
  readonly name: string; readonly transport: 'stdio' | 'http';
  readonly command?: string; readonly url?: string;
  readonly env?: Readonly<Record<string, SecretRef | string>>;
  readonly scope?: 'session' | 'shared';                   // D8 override
  readonly risk?: 'safe' | 'guarded' | 'dangerous';        // default 'guarded'
}
export interface ToolPolicy { readonly allow?: readonly string[]; readonly deny?: readonly string[] }  // glob on tool name

export interface CaseContext extends Context<CaseCtxConfig, CaseCtxState> {
  readonly case: Case;
  readonly resolvedTarget: TargetSpec;                     // placeholders/secrets resolved
  readonly workdir: string;                                // sandbox root for files
  readonly toolPolicy: ToolPolicy;
  secret(ref: SecretRef): ModuleResult<string>;            // sync; never traced/logged
}
```

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `CaseModule` / `CaseServiceImpl` | `module.ts` `service.ts` | CRUD via `EP.Store`; Zod drafts |
| `CaseContextImpl` | `context.ts` | resolves secrets into memory; exposes workdir + policy |
| `SecretVault` | `secrets.ts` | OS keychain, else age-encrypted file; `secret()` reads memory only |
| `captureAuthState` | `authCapture.ts` | drives a **headed** session from the injected `SessionFactory` (D11), waits until the login settles (cookies present and unchanged), writes it to `<workroot>/auth/<caseId>.json` |
| `CaseValidator` | `validate.ts` | reachability (via a throwaway session) + auth freshness + secret resolvability → advisory `Outcome` |
| `WorkdirManager` | `workdir.ts` | `~/.domia/work/<runId>/`, retention on dispose |

## Design notes / problems handled

- **D11.** case never imports `@domia/tools`. `captureAuth`/`validate` receive a
  `SessionFactory` (contracts type) from whoever calls them (api/loop resolves
  `EP.ToolService`). Layer stays clean; documented so it isn't flagged as a leak.
- **F7 — captured logins.** `captureAuth` cannot ask "are you done?" (the service has
  no human channel), so it watches the browser instead and keeps the auth state once it
  stops changing; an empty browser is reported as `captured:false`, never faked.
  `allocContext` hands the saved file to the run as `CaseContext.authStatePath`, which
  the loop passes to `allocSession` as `authStateFile` — runs start already signed in.
- **Secrets.** Resolved once at `allocContext`; live only in `CaseContext` memory;
  `RedactionFilter` in trace guarantees they never persist.
- **Tool policy travels with the case** and is handed to `allocSession` +
  the loop's composer (F11), so every tool source is gated the same way.

## File manifest

```
case/
  package.json  tsconfig.json
  src/
    module.ts context.ts secrets.ts authCapture.ts
    index.ts
```
