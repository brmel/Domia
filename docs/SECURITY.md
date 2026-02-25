# Security

Electron security checklist and agent safety controls.

---

## Electron Security

### BrowserWindow Settings

```typescript
// src/presentation/electron/main.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,        // Never enable
    contextIsolation: true,        // Always enable
    sandbox: true,                 // Always enable
    webSecurity: true,             // Always enable
    preload: path.join(__dirname, 'preload.js'),
  },
});
```

### Preload Script

Expose only specific APIs via context bridge:

```typescript
// src/presentation/electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  runTest: (input: unknown) => ipcRenderer.invoke('test:run', input),
  cancelTest: () => ipcRenderer.invoke('test:cancel'),
  getRun: (id: string) => ipcRenderer.invoke('test:get', id),
  // No direct Node.js or Electron access
});
```

### IPC Validation

Validate all inputs from renderer:

```typescript
// src/presentation/electron/ipc-handlers/TestHandlers.ts
ipcMain.handle('test:run', async (_, raw: unknown) => {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input' };
  }
  // Proceed with validated input
});
```

---

## Browser Automation Security

### Ephemeral Contexts

Each test runs in isolated context:

```typescript
// src/infrastructure/adapters/browser/PlaywrightAdapter.ts
async launch(): ResultAsync<void, BrowserError> {
  this.browser = await chromium.launch();
  this.context = await this.browser.newContext({
    // Isolated storage per test
    storageState: undefined,
  });
  this.page = await this.context.newPage();
}
```

### Network Filtering

Block tracking and ads:

```typescript
const BLOCKED_DOMAINS = [
  'google-analytics.com',
  'facebook.net',
  'doubleclick.net',
];

await context.route('**/*', (route) => {
  const url = route.request().url();
  if (BLOCKED_DOMAINS.some(d => url.includes(d))) {
    return route.abort();
  }
  return route.continue();
});
```

---

## Agent Safety Controls

### Forbidden Actions

Block destructive operations:

```typescript
// src/domain/value-objects/AgentAction.ts
const FORBIDDEN_PATTERNS = [
  /delete/i,
  /remove/i,
  /cancel.*subscription/i,
  /checkout/i,
  /purchase/i,
  /transfer.*funds/i,
];

export function isForbiddenAction(action: AgentAction): boolean {
  if (action.type !== 'click') return false;
  return FORBIDDEN_PATTERNS.some(p => p.test(action.thought));
}
```

### Confirmation Required

Pause for user confirmation on sensitive actions:

```typescript
// src/application/use-cases/RunUseCase.ts
if (requiresConfirmation(action)) {
  const confirmed = await this.promptUser(action);
  if (!confirmed) {
    return errAsync(new UserCancelledError());
  }
}
```

---

## API Key Security

- **Never log API keys**
- **Store in OS keychain**, not files (see CONFIGURATION.md)
- **Validate key format** before API calls
- **Mask in UI**: `sk-ant-***...***`

---

## Checklist

- [ ] `nodeIntegration: false`
- [ ] `contextIsolation: true`
- [ ] `sandbox: true`
- [ ] Minimal `contextBridge` exposure
- [ ] IPC input validation
- [ ] Ephemeral browser contexts
- [ ] Network filtering enabled
- [ ] Forbidden action patterns
- [ ] API keys in keychain
