# @domia/hosts — Interface Spec

**Purpose.** Composition roots — the only packages that import everything (rule
D5). Two hosts share one boot; differ only in transport + shell.

**Kind.** Composition roots — exempt from the lifecycle.

---

## Public interface

```ts
export function bootHeadless(cfg: HostConfig): Promise<ModuleResult<Kernel>>;   // tests boot this
export function bootDesktop(cfg: HostConfig): Promise<ModuleResult<Kernel>>;
export function loadUserPlugins(dir: string): Promise<ModuleResult<readonly DomiaModule[]>>;

export interface HostConfig {
  readonly dbPath: string; readonly artifactsDir: string;
  readonly pluginsDir?: string; readonly promptsDir: string;
  readonly providerAuth: Readonly<Record<string, AuthRef>>;
  readonly bind?: { host: string; port: number };   // headless; defaults 127.0.0.1
}
```

## The shared boot

```ts
const kernel = createKernel(cfg);
await kernel.load([
  traceModule(),                    // FIRST (D4 — promotes NoopTracer → real)
  storeModule(), toolsModule(), agentModule(),
  caseModule(), planModule(), memoryModule(),
  loopModule(), apiModule(),
  ...(await loadUserPlugins(cfg.pluginsDir))._unsafeUnwrap(),   // same ModuleHost (D6 of ecosystem)
]);
```

## Desktop (`hosts/desktop/`)

| Class | File | Responsibility |
|---|---|---|
| `bootDesktop` | `main.ts` | shared boot + Electron app lifecycle |
| `MainWindow` | `window.ts` | main window + agent `WebContentsView`; sandbox, contextIsolation, `nodeIntegration:false` (V1 posture) |
| `IpcBridge` | `ipc.ts` | tRPC-over-IPC exposing `DomiaApi`; every procedure Zod-validated; `ApiResult` only (no stacks) |
| `ArtifactProtocol` | `artifactProtocol.ts` | **F4** — registers `domia-artifact://<sha256>`, streams from `ArtifactStore`; UI never gets bytes over IPC |
| `Menu` | `menu.ts` | app menu |

## Headless (`hosts/headless/`)

| Class | File | Responsibility |
|---|---|---|
| `bootHeadless` | `main.ts` | shared boot + transport |
| `WsGateway` | `ws.ts` | **R8** — typed WS transport for `DomiaApi` (request/response + server-push events, schema-validated frames); loopback `127.0.0.1` default. A remote-daemon convenience, not a cluster |
| `SseFallback` | `sse.ts` | HTTP + SSE for `runs.watch`/`plans.watch` where WS is unwanted |
| `HttpApi` | `http.ts` | REST projection of `DomiaApi` for simple scripts |

Deferred (DESIGN §17, not built): a `NodeRegistry` + remote `RunHandle` map would
turn the headless host into a control plane over worker nodes. Kept out of scope —
single-host today; the `invoke`/`observe` seam makes it an additive change later.

## Packaging (slice 9)

| Artifact | Build | What it contains |
|---|---|---|
| `dist/domia.mjs` | `npm run build:cli` (esbuild, `scripts/build-cli.mjs`) | the whole CLI + backend bundled; `dist/prompts/` beside it; playwright-mcp stays external (a spawned process) |
| `Domia.app` / `.dmg` / NSIS / AppImage | `npm run package:desktop` (electron-vite → electron-builder, `packages/hosts/desktop/electron-builder.yml`) | bundled main/preload/renderer in asar; `prompts/` and `node_modules/@playwright/*` as unpacked resources |

- **Nothing resolves from the user's cwd.** `findPromptsDir()` and `loadEnvKeys()`
  search the install's own directories (`paths.ts`: ancestors of the running module
  plus Electron's `resourcesPath`), then `~/.domia/.env`, then cwd.
  `DOMIA_PROMPTS_DIR` and `DOMIA_DATA_DIR` override.
- **Kernel config from the host.** `HostConfig.values` reaches `ScopedConfig`, so a
  host (or a test) can set module config like `tools.record.video` without env vars.
- **CI + release are free-tier only** (`.github/workflows/`): `check` runs the suite
  under `xvfb-run` on ubuntu; `release` builds mac/win/linux from a `v*` tag and
  attaches the CLI tarball + installers. Builds are unsigned — see `INSTALL.md`.
- **The packaged app is drivable by Domia.** The main process forwards
  `ELECTRON_REMOTE_DEBUGGING_PORT` to a Chromium switch, which is the only way an
  Electron app can be given a CDP port — `tests/integration/desktop.test.ts` drives the
  packaged build through the electron target.

## Design notes

- **Trace-first ordering** is the only load privilege (D4); everything else is
  plain module order by `manifest.requires`.
- **Security posture** carried from V1: renderer sandboxed, IPC validated, no
  secrets/stacks on the wire; headless loopback-only by default; MCP mounts +
  tool policy + approvals compose the runtime guardrails.
- **Plugins** load through the same `ModuleHost` as built-ins — no privileged path.

## File manifest

```
hosts/
  desktop/  package.json  src/{main.ts, window.ts, ipc.ts, artifactProtocol.ts, menu.ts}
  headless/ package.json  src/{index.ts, config.ts, env.ts, paths.ts, ipc.ts, plugins.ts}
  shared/   src/boot.ts config.ts plugins.ts     # bootKernel + HostConfig loader (cosmiconfig)
```
