---
name: playwright
description: How we use Playwright in this repo. Locator vs ElementHandle, ARIA snapshots, role refs, page lifecycle, common timeout traps, where Playwright code is allowed to live.
---

# Playwright — Repo Conventions

Playwright is **the** browser automation. All Playwright-specific code lives under `infrastructure/playwright/`. Replacing browser automation = replacing this folder.

## Where Playwright is allowed

```
infrastructure/playwright/
├── PlaywrightAdapter.ts            # implements IStructuredAutomation
├── PlaywrightPerceptionSource.ts   # IPerceptionSource adapter
├── BrowserPool.ts                  # shared chromium instance
├── perception/                     # Playwright-bound sensors
│   ├── AriaSensor.ts
│   ├── SmartScrollCapture.ts
│   └── RoleRefResolver.ts
└── electron/                       # Playwright-via-CDP for Electron
    ├── ElectronDriver.ts
    ├── ElectronDriverProvider.ts
    ├── ElectronWindowManager.ts
    └── ElectronWindowSelectionPolicy.ts
```

If you find yourself importing `playwright` outside this folder, you've probably violated the boundary. Move the code or hide the dependency.

## Locator over ElementHandle

`Locator` is lazy + retryable. `ElementHandle` is eager + can become stale. We use `Locator` exclusively for ref-based interactions.

```ts
const locator = page.locator(`internal:role=${role}[name="${name}"i]`);
await locator.click({ timeout: ELEMENT_WAIT_TIMEOUT_MS });
```

## Role refs

`AriaSensor` snapshots `aria(role + name)` pairs. `RoleRefResolver` maps a logical ref string back to a `Locator`. Tools never deal with Playwright selectors directly — they pass refs and `RoleRefResolver` resolves.

## Common timeout traps

- `page.waitForLoadState('networkidle')` is a coin flip on real pages — prefer `page.waitForLoadState('domcontentloaded')` + element-level waits.
- Default timeout is 30s. Use the constants in `shared/defaults/platform.defaults.ts` (`NAVIGATION_TIMEOUT_MS`, `ELEMENT_WAIT_TIMEOUT_MS`, etc.).
- `locator.click({ timeout: 0 })` disables timeouts — only use this if you've already waited for the element another way.

## Page lifecycle

- `BrowserPool` owns the long-lived `Browser`.
- A run owns its `BrowserContext` and one or more `Page`s.
- When a page closes, `PlaywrightAdapter.attachPageLifecycleHandlers` reassigns to the most recent surviving page.
- `wsEndpoint()` is **not** available on a regular `Browser` — only on `BrowserServer`. We removed all calls to it.

## Electron over CDP

`ElectronDriver` connects via:
- `chromium.connectOverCDP(cdpUrl)` for already-running Electron apps.
- `chromium.launch({ executablePath, args: ['--remote-debugging-port=PORT'], ignoreDefaultArgs: true })` for launching ours.

`ElectronWindowManager` discovers all open `Page`s in the connected `Browser` and `ElectronWindowSelectionPolicy` scores them to pick the active one.

## Tests

Real e2e tests use a real `chromium.launch({ headless: true })`. The fixture HTML server lives at `tests/e2e/cli/helpers/web-fixture-server.ts`. Tests should:
1. Start a fixture server.
2. Construct `PlaywrightAdapter` directly with `new ConsoleLogger()`.
3. `await adapter.launch({ headless: true })`.
4. Run the test against `server.baseUrl`.
5. `afterAll` close adapter + server.

No mocked Playwright. We test the real adapter behavior.
