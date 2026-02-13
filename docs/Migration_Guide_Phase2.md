# Migration Guide: Phase 2 Refactoring

This guide helps you migrate existing code to use the refactored Phase 2 architecture with improved types, constants, and design patterns.

---

## Table of Contents

1. [Import Updates](#import-updates)
2. [Platform Enum Migration](#platform-enum-migration)
3. [Constants Usage](#constants-usage)
4. [Validation Integration](#validation-integration)
5. [Window Management](#window-management)
6. [Tool Creation](#tool-creation)
7. [Error Handling](#error-handling)
8. [Breaking Changes](#breaking-changes)

---

## Import Updates

### Add New Imports

```typescript
// Platform enum and constants
import { Platform, CDP_CONSTANTS, TOOL_TIMEOUTS, SCROLL_CONSTANTS } from '@/domain/constants/PlatformConstants';

// Validation
import { CDPValidator, ValidationError } from '@/domain/validators/CDPValidator';

// Tool factory
import { CommonWebToolsFactory } from '@/infrastructure/adapters/drivers/CommonWebToolsFactory';

// Window manager (for ElectronDriver)
import { ElectronWindowManager } from '@/infrastructure/adapters/drivers/ElectronWindowManager';
```

---

## Platform Enum Migration

### Before (String Literals)

```typescript
const capabilities = driver.getCapabilities();

if (capabilities.platform === 'electron') {
    // Electron-specific code
}

if (capabilities.platform === 'web') {
    // Web-specific code
}

const snapshot = {
    platform: 'electron',
    // ... other fields
};
```

### After (Type-Safe Enum)

```typescript
import { Platform } from '@/domain/constants/PlatformConstants';

const capabilities = driver.getCapabilities();

if (capabilities.platform === Platform.ELECTRON) {
    // Electron-specific code
}

if (capabilities.platform === Platform.WEB) {
    // Web-specific code
}

const snapshot = {
    platform: Platform.ELECTRON,
    // ... other fields
};
```

### Platform Enum Values

```typescript
export enum Platform {
    WEB = 'web',
    ELECTRON = 'electron',
    MOBILE = 'mobile'
}
```

---

## Constants Usage

### Before (Magic Numbers/Strings)

```typescript
// CDP connection
const cdpUrl = 'http://localhost:9222';
await cdp.connect(cdpUrl, 30000);

// Tool timeouts
await page.click(selector, { timeout: 5000 });
await page.fill(selector, text, { timeout: 5000 });
await page.goto(url, { timeout: 30000 });

// Scrolling
window.scrollBy(0, 500);

// Window polling
while (windows.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
}
```

### After (Centralized Constants)

```typescript
import { CDP_CONSTANTS, TOOL_TIMEOUTS, SCROLL_CONSTANTS } from '@/domain/constants/PlatformConstants';

// CDP connection
await cdp.connect(CDP_CONSTANTS.DEFAULT_URL, CDP_CONSTANTS.CONNECTION_TIMEOUT_MS);

// Tool timeouts
await page.click(selector, { timeout: TOOL_TIMEOUTS.CLICK_MS });
await page.fill(selector, text, { timeout: TOOL_TIMEOUTS.TYPE_MS });
await page.goto(url, { timeout: TOOL_TIMEOUTS.NAVIGATION_MS });

// Scrolling
window.scrollBy(0, SCROLL_CONSTANTS.AMOUNT_PX);

// Window polling
while (windows.length === 0) {
    await new Promise(resolve => setTimeout(resolve, CDP_CONSTANTS.WINDOW_POLL_INTERVAL_MS));
}
```

### Available Constants

```typescript
// CDP constants
CDP_CONSTANTS.DEFAULT_PORT // 9222
CDP_CONSTANTS.DEFAULT_HOST // 'localhost'
CDP_CONSTANTS.DEFAULT_URL // 'http://localhost:9222'
CDP_CONSTANTS.CONNECTION_TIMEOUT_MS // 30000
CDP_CONSTANTS.WINDOW_WAIT_TIMEOUT_MS // 5000
CDP_CONSTANTS.WINDOW_POLL_INTERVAL_MS // 500

// Tool timeouts
TOOL_TIMEOUTS.CLICK_MS // 5000
TOOL_TIMEOUTS.TYPE_MS // 5000
TOOL_TIMEOUTS.NAVIGATION_MS // 30000
TOOL_TIMEOUTS.ELEMENT_WAIT_MS // 10000
TOOL_TIMEOUTS.DEFAULT_SCREENSHOT_TIMEOUT_MS // 30000

// Scroll constants
SCROLL_CONSTANTS.AMOUNT_PX // 500
SCROLL_CONSTANTS.SMOOTH_BEHAVIOR // false

// Window ID constants
WINDOW_ID_CONSTANTS.PREFIX // 'electron-window'
WINDOW_ID_CONSTANTS.SEPARATOR // '-'
```

---

## Validation Integration

### Before (Manual Validation)

```typescript
if (!cdpUrl || !cdpUrl.startsWith('http')) {
    throw new Error('Invalid CDP URL');
}

if (!windowId || windowId.trim() === '') {
    throw new Error('Invalid window ID');
}

if (timeout < 0 || timeout > 60000) {
    throw new Error('Timeout out of range');
}
```

### After (Using CDPValidator)

```typescript
import { CDPValidator } from '@/domain/validators/CDPValidator';

// Validate CDP URL
const urlResult = CDPValidator.validateCDPUrl(cdpUrl);
if (urlResult.isErr()) {
    return ResultAsync.fromSafePromise(Promise.resolve({
        success: false,
        error: urlResult.error.message
    }));
}

// Validate window ID
const windowIdResult = CDPValidator.validateWindowId(windowId);
if (windowIdResult.isErr()) {
    return { success: false, error: windowIdResult.error.message };
}

// Validate timeout
const timeoutResult = CDPValidator.validateTimeout(timeout);
if (timeoutResult.isErr()) {
    throw timeoutResult.error;
}
```

### Validation Methods

```typescript
CDPValidator.validateCDPUrl(url: string): Result<string, ValidationError>
CDPValidator.validateTimeout(timeoutMs: number): Result<number, ValidationError>
CDPValidator.validateWindowId(windowId: string): Result<string, ValidationError>
CDPValidator.validateMenuPath(menuPath: string): Result<string, ValidationError>
```

### ValidationError

```typescript
class ValidationError extends Error {
    constructor(
        message: string,
        public readonly field: string,
        public readonly value: unknown
    )
}
```

---

## Window Management

### Before (Manual Map Management in ElectronDriver)

```typescript
private windows: Map<string, ElectronWindow> = new Map();
private activeWindowId: string | null = null;

// Registration
const windowId = `electron-window-${Date.now()}`;
this.windows.set(windowId, { id: windowId, page, title, url });
if (!this.activeWindowId) {
    this.activeWindowId = windowId;
}

// Retrieval
const window = this.windows.get(windowId);
if (!window) {
    return { success: false, error: 'Window not found' };
}

// Finding by title
const targetWindow = Array.from(this.windows.values()).find(w =>
    w.title.includes(searchTitle)
);

// Cleanup
this.windows.clear();
this.activeWindowId = null;
```

### After (Using ElectronWindowManager)

```typescript
import { ElectronWindowManager } from '@/infrastructure/adapters/drivers/ElectronWindowManager';

private windowManager: ElectronWindowManager;

constructor(
    // ... other dependencies
    @inject('ILogger') private logger: ILogger
) {
    this.windowManager = new ElectronWindowManager(logger);
}

// Registration
const result = await this.windowManager.registerWindow(page);
if (result.isErr()) {
    this.logger.warn(`Failed to register: ${result.error.message}`);
}

// Retrieval
const result = this.windowManager.getWindow(windowId);
if (result.isErr()) {
    return { success: false, error: result.error.message };
}
const window = result.value;

// Finding by title
const result = this.windowManager.findWindow({ title: searchTitle });
if (result.isOk()) {
    const targetWindow = result.value;
}

// Cleanup
this.windowManager.clear();
```

### WindowManager API

```typescript
// Registration
registerWindow(page: Page): Promise<Result<string, Error>>
unregisterWindow(windowId: string): Result<void, ValidationError>

// Retrieval
getWindow(windowId: string): Result<ElectronWindow, ValidationError>
getActiveWindow(): ElectronWindow | null
getAllWindows(): ElectronWindow[]
getWindowCount(): number

// Selection
setActiveWindow(windowId: string): Result<void, ValidationError>
findWindow(selector: { title?: string; url?: string }): Result<ElectronWindow | undefined, Error>

// Cleanup
clear(): void
```

---

## Tool Creation

### Before (Manual Tool Creation with Duplication)

```typescript
// In WebDriver
getTools(): ToolDefinition[] {
    return [
        {
            name: 'click_element',
            description: 'Click on an element',
            schema: z.object({ elementId: z.number() }),
            execute: async (params) => {
                const result = await this.playwright.click(id);
                if (result.isOk()) return { success: true };
                return { success: false, error: result.error.message };
            }
        },
        // ... 4 more tools
    ];
}

// In ElectronDriver (identical tools duplicated)
getTools(): ToolDefinition[] {
    return [
        {
            name: 'click_element',
            description: 'Click on an element',
            schema: z.object({ elementId: z.number(), windowId: z.string().optional() }),
            execute: async (params) => {
                // Similar code but with window support
            }
        },
        // ... 4 more duplicated tools
    ];
}
```

### After (Using CommonWebToolsFactory)

```typescript
import { CommonWebToolsFactory } from '@/infrastructure/adapters/drivers/CommonWebToolsFactory';

// In WebDriver
private getCommonTools(): ToolDefinition[] {
    return CommonWebToolsFactory.createAll(
        async (windowId, action) => {
            const page = this.playwright.page;
            if (!page) {
                return { success: false, error: 'No page available' };
            }
            return action(page);
        }
    );
}

// In ElectronDriver
private getCommonTools(): ToolDefinition[] {
    return CommonWebToolsFactory.createAll(
        (windowId, action) => this.executeInWindow(windowId, action)
    );
}
```

### Factory Method Signature

```typescript
CommonWebToolsFactory.createAll(
    executeInWindow: (
        windowId: string | undefined,
        action: (page: Page) => Promise<ActionResult>
    ) => Promise<ActionResult>
): ToolDefinition[]
```

### Created Tools

The factory creates these tools:
- `click_element`: Click by element ID
- `type_text`: Type text with optional submit
- `scroll_page`: Scroll up/down
- `wait`: Wait for duration

---

## Error Handling

### Before (Imperative with Promises)

```typescript
execute: async (params) => {
    const result = await this.playwright.click(id);
    if (result.isOk()) {
        return { success: true, message: `Clicked element ${id}` };
    }
    return { success: false, error: result.error.message };
}
```

### After (Functional with ResultAsync)

```typescript
import { ResultAsync, okAsync } from 'neverthrow';

execute: (params) => {
    const id = ElementIdFactory.unsafe(params.elementId);
    return this.playwright.click(id)
        .map(() => ({ 
            success: true, 
            message: `Clicked element ${id}` 
        } as ActionResult))
        .mapErr(err => new Error(err.message));
}
```

### Chaining Operations

```typescript
execute: (params) => {
    const id = ElementIdFactory.unsafe(params.elementId);
    return this.playwright.type(id, params.text)
        .andThen(() => {
            if (params.submit) {
                return this.playwright.pressKey('Enter')
                    .map(() => ({ 
                        success: true, 
                        message: `Typed and submitted` 
                    } as ActionResult));
            }
            return okAsync({ 
                success: true, 
                message: `Typed into ${id}` 
            } as ActionResult);
        })
        .mapErr(err => new Error(err.message));
}
```

### Result Type Handling

```typescript
// Check success/failure
if (result.isOk()) {
    const value = result.value;
    // Use value
} else {
    const error = result.error;
    // Handle error
}

// Map over success
result.map(value => transformValue(value));

// Map over error
result.mapErr(error => new CustomError(error.message));

// Chain operations
result.andThen(value => performNextOperation(value));
```

---

## Breaking Changes

### 1. Platform Type Changed

**Breaking**: `platform` field type changed from `string` to `Platform` enum

**Migration**:
```typescript
// Before
if (snapshot.platform === 'electron') { }

// After
import { Platform } from '@/domain/constants/PlatformConstants';
if (snapshot.platform === Platform.ELECTRON) { }
```

### 2. Tool Execute Return Type Changed (WebDriver only)

**Breaking**: Tool `execute` methods now return `ResultAsync` instead of `Promise`

**Migration**:
```typescript
// Before
execute: async (params) => {
    // ... implementation
    return { success: true };
}

// After
execute: (params) => {
    return ResultAsync.fromPromise(
        (async () => {
            // ... implementation
            return { success: true };
        })(),
        (e) => new Error(`Operation failed: ${e}`)
    );
}
```

### 3. ToolContext Changed

**Breaking**: `ToolContext` now requires proper fields (no longer accepts arbitrary properties)

**Migration**:
```typescript
// Before
const context = {
    snapshot: snapshot,
    testId: 'test-123',
    stepNumber: 1
};

// After
const context = {
    driver: driver,
    logger: logger,
    controller: controller
};
```

### 4. Window Management Methods Removed from ElectronDriver

**Breaking**: Direct window management methods removed, use `windowManager` instead

**Migration**:
```typescript
// Before (internal to ElectronDriver)
this.windows.get(windowId)
this.activeWindowId
this.generateWindowId()

// After (use WindowManager)
this.windowManager.getWindow(windowId)
this.windowManager.getActiveWindow()
// generateWindowId is now private to WindowManager
```

---

## Examples

### Complete Example: Creating a Driver

```typescript
import { container } from 'tsyringe';
import { AppDriverFactory } from '@/infrastructure/adapters/drivers/AppDriverFactory';
import { ToolRegistry } from '@/domain/tools/ToolRegistry';
import { Platform, CDP_CONSTANTS } from '@/domain/constants/PlatformConstants';

async function main() {
    // Get factory and registry from DI container
    const factory = container.resolve(AppDriverFactory);
    const toolRegistry = container.resolve(ToolRegistry);

    // Create Electron driver
    const driver = await factory.createDriver({ 
        platform: Platform.ELECTRON 
    });

    // Connect with validation
    const connectResult = await driver.connect({ 
        cdpUrl: CDP_CONSTANTS.DEFAULT_URL 
    });

    if (connectResult.isErr()) {
        console.error('Connection failed:', connectResult.error);
        return;
    }

    // Register tools
    const tools = driver.getTools();
    toolRegistry.registerMany(tools);

    // Create tool context
    const context = {
        driver: driver,
        logger: undefined,
        controller: undefined
    };

    // Execute tool
    const result = await toolRegistry.executeTool(
        'click_element',
        { elementId: 42 },
        context
    );

    if (result.isOk()) {
        console.log('Success:', result.value);
    } else {
        console.error('Failed:', result.error);
    }

    // Cleanup
    await driver.disconnect();
}
```

---

## Checklist

Use this checklist when migrating code:

- [ ] Update imports to use new constants/enums
- [ ] Replace string literals with `Platform` enum
- [ ] Replace magic numbers with constants (`CDP_CONSTANTS`, `TOOL_TIMEOUTS`, etc.)
- [ ] Add validation using `CDPValidator` where appropriate
- [ ] Update tool `execute` methods to return `ResultAsync` (WebDriver)
- [ ] Replace direct window management with `ElectronWindowManager`
- [ ] Update `ToolContext` to use proper fields
- [ ] Use `CommonWebToolsFactory` instead of manual tool creation
- [ ] Update error handling to use Result types
- [ ] Test all migrated code paths

---

## Support

If you encounter issues during migration:

1. Check the [Phase 2 Refactoring Summary](./Phase2_Refactoring_Summary.md) for detailed changes
2. Review the [examples](./examples/electron-driver-example.ts) for working code
3. Check TypeScript errors for guidance on type mismatches
4. Consult the domain/infrastructure architecture documentation

---

## Timeline

Recommended migration schedule:

1. **Week 1**: Update imports and constants (low risk)
2. **Week 2**: Migrate to Platform enum (medium risk, requires testing)
3. **Week 3**: Integrate validation (low risk, adds safety)
4. **Week 4**: Refactor tool creation and error handling (high value, medium effort)
5. **Week 5**: Testing and validation of all changes
