# Platform Support Implementation Plan

**Status**: In Planning  
**Version**: 1.0  
**Date**: February 11, 2026  
**Branch**: SupportElectronApps

---

## Executive Summary

This document outlines the complete architectural design and implementation plan for adding multi-platform support to Domia, enabling seamless testing of Web applications, Electron apps, and future platforms (Mobile, Desktop) through a unified, type-safe interface.

### Current State
- ✅ ElectronDriver implemented (CDP-based)
- ✅ WebDriver implemented (Playwright-based)
- ✅ AppDriverFactory exists but unused
- ❌ UI has no platform selector
- ❌ No platform discrimination in data flow
- ❌ RunTestInput hardcoded to web-only

### Goal State
- ✅ Discriminated union types across all layers
- ✅ Platform registry pattern for extensibility
- ✅ Compile-time type safety from UI to driver
- ✅ Zero coupling between platforms
- ✅ Easy addition of new platforms

---

## Architecture Analysis

### Design Pattern: Discriminated Union + Strategy Registry

**Why This Approach?**

1. **Type Safety**: TypeScript's discriminated unions provide exhaustive checking
2. **Extensibility**: Registry pattern allows new platforms without touching core
3. **Separation of Concerns**: Each platform encapsulated independently
4. **SOLID Compliance**: Single Responsibility, Open/Closed, Dependency Inversion
5. **Testability**: Platform logic testable in isolation

**Rejected Alternatives:**
- ❌ Simple if/else: Not extensible, violates Open/Closed Principle
- ❌ Pure Strategy Pattern: Loses compile-time type safety
- ❌ Inheritance: Creates tight coupling, harder to extend

### Platform Comparison Matrix

| Aspect | Web Browser | Electron App | Future (Mobile) |
|--------|-------------|--------------|-----------------|
| **Primary Input** | URL string | Executable path OR CDP URL | App ID, Bundle ID |
| **Connection Method** | Launch browser | Connect to running app via CDP OR Launch executable | Platform-specific SDK |
| **Prerequisites** | None | App running with remote debugging OR Executable accessible | Device connected, Developer mode enabled |
| **Configuration** | Headless, viewport | CDP URL, Window title filter, Launch args | Device serial, Orientation, App permissions |
| **Driver** | WebDriver (Playwright) | ElectronDriver (CDP client) | MobileDriver (Appium/custom) |
| **Unique Challenges** | Standard web navigation | Multi-window management, Native dialogs | Touch gestures, Device rotation |

---

## Type System Design

### Core Types Hierarchy

```typescript
// ===== DOMAIN LAYER =====
// src/domain/types/PlatformConfig.ts

/**
 * Supported platform types
 * Extend this union when adding new platforms
 */
export type PlatformType = 'web' | 'electron';

/**
 * Base configuration shared by all platforms
 */
export interface BasePlatformConfig {
  platform: PlatformType;
  prompt: string; // User's test goal/instructions
}

/**
 * Web platform configuration
 * Standard browser testing with URL
 */
export interface WebPlatformConfig extends BasePlatformConfig {
  platform: 'web';
  url: string; // Website URL (auto-prefixed with https://)
}

/**
 * Electron platform configuration
 * Supports both CDP connection and executable launch
 */
export interface ElectronPlatformConfig extends BasePlatformConfig {
  platform: 'electron';
  connection: ElectronConnection;
}

/**
 * Electron connection methods (discriminated union)
 */
export type ElectronConnection = 
  | ElectronCDPConnection 
  | ElectronExecutableConnection;

export interface ElectronCDPConnection {
  type: 'cdp';
  cdpUrl: string; // e.g., http://localhost:9222
  windowTitle?: string; // Optional: filter to specific window
}

export interface ElectronExecutableConnection {
  type: 'executable';
  executablePath: string; // Path to .exe/.app file
  launchArgs?: string[]; // Optional: command-line arguments
  windowTitle?: string; // Optional: filter to specific window
}

/**
 * Discriminated union of all platform configs
 * TypeScript will enforce exhaustive checking
 */
export type PlatformConfig = 
  | WebPlatformConfig 
  | ElectronPlatformConfig;
```

### Benefits of This Type System

1. **Exhaustive Checking**: TypeScript forces handling of all platform types
2. **Autocomplete**: IDE suggests platform-specific fields
3. **Refactoring Safety**: Renaming fields updates all usages
4. **Documentation**: Types serve as living documentation
5. **Runtime Safety**: Combined with Zod, prevents invalid data

---

## Validation Layer Design

### Zod Schema Structure

```typescript
// ===== src/shared/validation/platforms/web.ts =====

import { z } from 'zod';

/**
 * Web platform validation schema
 * Auto-prefixes URLs without protocol
 */
export const WebConfigSchema = z.object({
  platform: z.literal('web'),
  url: z.string()
    .trim()
    .min(1, "URL is required")
    .transform(val => {
      // Auto-prefix common URLs
      if (!val.startsWith('http://') && !val.startsWith('https://')) {
        return `https://${val}`;
      }
      return val;
    }),
  prompt: z.string()
    .trim()
    .min(1, "Test instructions are required")
    .max(5000, "Instructions too long"),
});

export type WebConfig = z.infer<typeof WebConfigSchema>;
```

```typescript
// ===== src/shared/validation/platforms/electron.ts =====

import { z } from 'zod';

/**
 * Electron CDP connection schema
 */
const ElectronCDPConnectionSchema = z.object({
  type: z.literal('cdp'),
  cdpUrl: z.string()
    .url("Must be a valid URL (e.g., http://localhost:9222)")
    .refine(url => url.startsWith('http://') || url.startsWith('https://'), {
      message: "CDP URL must use HTTP protocol"
    }),
  windowTitle: z.string().optional(),
});

/**
 * Electron executable launch schema
 */
const ElectronExecutableConnectionSchema = z.object({
  type: z.literal('executable'),
  executablePath: z.string()
    .min(1, "Executable path is required")
    .refine(path => {
      // Validate common executable extensions
      return /\.(exe|app)$/i.test(path) || !path.includes('.');
    }, {
      message: "Must be a valid executable (.exe, .app, or no extension)"
    }),
  launchArgs: z.array(z.string()).optional(),
  windowTitle: z.string().optional(),
});

/**
 * Electron connection union (CDP or Executable)
 */
const ElectronConnectionSchema = z.discriminatedUnion('type', [
  ElectronCDPConnectionSchema,
  ElectronExecutableConnectionSchema,
]);

/**
 * Complete Electron platform schema
 */
export const ElectronConfigSchema = z.object({
  platform: z.literal('electron'),
  connection: ElectronConnectionSchema,
  prompt: z.string()
    .trim()
    .min(1, "Test instructions are required")
    .max(5000, "Instructions too long"),
});

export type ElectronConfig = z.infer<typeof ElectronConfigSchema>;
```

```typescript
// ===== src/shared/validation/index.ts =====

import { z } from 'zod';
import { WebConfigSchema } from './platforms/web';
import { ElectronConfigSchema } from './platforms/electron';

/**
 * Master platform configuration schema
 * Discriminated union validated at runtime
 */
export const PlatformConfigSchema = z.discriminatedUnion('platform', [
  WebConfigSchema,
  ElectronConfigSchema,
]);

/**
 * Test execution options (platform-agnostic)
 */
export const TestOptionsSchema = z.object({
  maxSteps: z.number().int().positive().max(100).default(20),
  headless: z.boolean().default(false),
  vision: z.boolean().default(true),
  debugScreenshots: z.boolean().default(false),
  verbose: z.boolean().default(false),
}).partial();

/**
 * Complete test input schema
 */
export const TestInputSchema = z.object({
  platformConfig: PlatformConfigSchema,
  options: TestOptionsSchema.optional(),
});

export type TestInput = z.infer<typeof TestInputSchema>;
```

---

## Presentation Layer Design

### Platform Registry Pattern

```typescript
// ===== src/presentation/config/platformRegistry.tsx =====

import { z } from 'zod';
import { BasePlatformConfig, PlatformType } from '@domain/types/PlatformConfig';
import { WebConfigSchema } from '@shared/validation/platforms/web';
import { ElectronConfigSchema } from '@shared/validation/platforms/electron';

/**
 * Props passed to platform-specific field renderers
 */
export interface FieldRenderProps {
  value: any;
  onChange: (value: any) => void;
  errors: Record<string, string>;
  disabled: boolean;
}

/**
 * Platform definition interface
 * Each platform must implement this
 */
export interface PlatformDefinition<T extends BasePlatformConfig> {
  type: T['platform'];
  label: string;
  description: string;
  icon: string;
  
  // Validation schema (without prompt field)
  schema: z.ZodType<Omit<T, 'prompt'>>;
  
  // Custom field renderer component
  renderFields: React.ComponentType<FieldRenderProps>;
  
  // Default values for new instances
  defaultValues: Omit<T, 'platform' | 'prompt'>;
}

/**
 * Central registry of all supported platforms
 * Add new platforms here
 */
export const platformRegistry: Record<PlatformType, PlatformDefinition<any>> = {
  web: {
    type: 'web',
    label: 'Web Browser',
    description: 'Test web applications and websites',
    icon: '🌐',
    schema: WebConfigSchema.omit({ prompt: true }),
    renderFields: WebPlatformFields,
    defaultValues: {
      url: '',
    },
  },
  
  electron: {
    type: 'electron',
    label: 'Electron App',
    description: 'Test Electron desktop applications',
    icon: '⚡',
    schema: ElectronConfigSchema.omit({ prompt: true }),
    renderFields: ElectronPlatformFields,
    defaultValues: {
      connection: {
        type: 'cdp',
        cdpUrl: 'http://localhost:9222',
      },
    },
  },
} as const;

/**
 * Get all available platforms
 */
export function getAvailablePlatforms(): PlatformDefinition<any>[] {
  return Object.values(platformRegistry);
}

/**
 * Get specific platform definition
 */
export function getPlatformDefinition(type: PlatformType): PlatformDefinition<any> {
  return platformRegistry[type];
}
```

### UI Component Structure

```
RunForm (Main Container)
├── PlatformSelector
│   └── Dropdown/Tabs to select platform
├── Dynamic Platform Fields
│   ├── WebPlatformFields (for web)
│   │   └── URL input
│   └── ElectronPlatformFields (for electron)
│       ├── Connection Type Selector (CDP/Executable)
│       ├── CDP URL input (if CDP)
│       ├── Executable Path input (if Executable)
│       ├── Launch Args input (optional)
│       └── Window Title filter (optional)
└── Prompt Field (shared)
    └── Multi-line text area
```

---

## Application Layer Updates

### Updated DTOs

```typescript
// ===== src/application/dtos.ts =====

import { PlatformConfig } from '@domain/types/PlatformConfig';
import { AgentAction, RunId } from '@domain/value-objects';
import { WorkflowError } from '@domain/errors';

/**
 * Updated RunTestInput with platform config
 */
export interface RunTestInput {
  platformConfig: PlatformConfig; // Discriminated union
  options?: {
    maxSteps?: number;
    headless?: boolean;
    vision?: boolean;
    debugScreenshots?: boolean;
  };
}

// RunTestOutput remains unchanged
export type RunTestOutput =
  | { type: 'started'; testRunId: RunId }
  | { type: 'observing' }
  | { type: 'thinking' }
  | { type: 'acting'; action: AgentAction }
  | { type: 'state_updated'; state: import('@domain/value-objects').WorkflowState }
  | { type: 'completed'; success: boolean; summary?: string }
  | { type: 'error'; error: WorkflowError | Error };
```

### RunUseCase Refactoring

```typescript
// ===== src/application/use-cases/RunUseCase.ts =====

async *execute(input: RunTestInput, controller: ExecutionController): AsyncGenerator<RunTestOutput, void, unknown> {
  // 1. Initialize Test Run (platform-agnostic)
  const { platformConfig, options } = input;
  
  // Extract URL for persistence (platform-specific)
  const urlForPersistence = this.extractUrlFromConfig(platformConfig);
  const prompt = platformConfig.prompt;
  
  const initResult = await this.lifecycleManager.initializeRun(
    urlForPersistence,
    prompt
  );
  
  if (initResult.isErr()) {
    yield { type: 'error', error: initResult.error };
    return;
  }
  
  const testRunId = initResult.value;
  yield { type: 'started', testRunId };
  
  // 2. Create platform-specific driver via factory
  let driver: IAppDriver;
  try {
    const driverConfig = this.buildDriverConfig(platformConfig);
    driver = await this.driverFactory.createDriver(driverConfig);
    
    // Connect driver (platform-specific initialization)
    const connectResult = driver.connect(driverConfig.connectionOptions);
    if (connectResult.isErr()) {
      throw new WorkflowError(`Failed to connect driver: ${connectResult.error.message}`);
    }
  } catch (error) {
    yield { type: 'error', error: new WorkflowError(`Driver initialization failed: ${error}`) };
    return;
  }
  
  // 3. Execute workflow (same as before)
  // ... rest of workflow unchanged
}

/**
 * Extract URL for persistence from platform config
 */
private extractUrlFromConfig(config: PlatformConfig): string {
  switch (config.platform) {
    case 'web':
      return config.url;
    case 'electron':
      if (config.connection.type === 'cdp') {
        return config.connection.cdpUrl;
      }
      return config.connection.executablePath;
    default:
      const _exhaustive: never = config;
      throw new Error(`Unknown platform: ${(_exhaustive as any).platform}`);
  }
}

/**
 * Build driver configuration from platform config
 */
private buildDriverConfig(config: PlatformConfig): DriverConfig {
  switch (config.platform) {
    case 'web':
      return {
        platform: 'web',
        connectionOptions: {
          headless: this.options?.headless ?? true,
        },
      };
      
    case 'electron':
      return {
        platform: 'electron',
        connectionOptions: 
          config.connection.type === 'cdp'
            ? { cdpUrl: config.connection.cdpUrl, windowTitle: config.connection.windowTitle }
            : { executablePath: config.connection.executablePath, launchArgs: config.connection.launchArgs, windowTitle: config.connection.windowTitle },
      };
      
    default:
      const _exhaustive: never = config;
      throw new Error(`Unknown platform: ${(_exhaustive as any).platform}`);
  }
}
```

---

## Infrastructure Layer Updates

### AppDriverFactory Enhancement

```typescript
// ===== src/infrastructure/adapters/drivers/AppDriverFactory.ts =====

/**
 * Enhanced driver configuration
 */
export interface DriverConfig {
  platform: PlatformType;
  connectionOptions: ConnectionOptions;
}

export type ConnectionOptions = 
  | WebConnectionOptions 
  | ElectronConnectionOptions;

export interface WebConnectionOptions {
  headless: boolean;
}

export interface ElectronConnectionOptions {
  cdpUrl?: string;
  executablePath?: string;
  launchArgs?: string[];
  windowTitle?: string;
}

/**
 * Create and initialize platform-specific driver
 */
async createDriver(config: DriverConfig): Promise<IAppDriver> {
  this.logger.info(`[AppDriverFactory] Creating ${config.platform} driver`);
  
  let driver: IAppDriver;
  
  switch (config.platform) {
    case 'web':
      driver = container.resolve(WebDriver);
      break;
      
    case 'electron':
      driver = container.resolve(ElectronDriver);
      break;
      
    default:
      const _exhaustive: never = config.platform;
      throw new Error(`Unsupported platform: ${_exhaustive}`);
  }
  
  this.registerDriverTools(driver);
  
  return driver;
}
```

---

## Implementation Phases

### Phase 1: Foundation (Types & Validation) ⏱️ 2-3 hours

**Files to Create:**
1. `src/domain/types/PlatformConfig.ts` - Core type definitions
2. `src/shared/validation/platforms/web.ts` - Web validation schema
3. `src/shared/validation/platforms/electron.ts` - Electron validation schema
4. `src/shared/validation/index.ts` - Export public API

**Files to Update:**
1. `src/application/dtos.ts` - Update RunTestInput interface
2. `src/shared/validation.ts` - Migrate to new structure (keep backward compat)

**Testing:**
- Unit tests for each validation schema
- Test discriminated union edge cases
- Verify proper error messages

**Success Criteria:**
- ✅ All types compile without errors
- ✅ Zod schemas validate correct inputs
- ✅ Discriminated unions enforce platform-specific fields
- ✅ Zero TypeScript errors

---

### Phase 2: UI Layer ⏱️ 4-5 hours

**Files to Create:**
1. `src/presentation/config/platformRegistry.tsx` - Platform registry
2. `src/presentation/components/platform/PlatformSelector.tsx` - Platform switcher
3. `src/presentation/components/platform/WebPlatformFields.tsx` - Web input fields
4. `src/presentation/components/platform/ElectronPlatformFields.tsx` - Electron input fields
5. `src/presentation/components/platform/ConnectionTypeSelector.tsx` - CDP/Executable toggle

**Files to Update:**
1. `src/presentation/components/RunForm.tsx` - Integrate platform selector
2. `src/presentation/stores/useRunStore.ts` - Store platform config

**Component Architecture:**

```tsx
// PlatformSelector.tsx
export function PlatformSelector({ value, onChange, disabled }: Props) {
  const platforms = getAvailablePlatforms();
  
  return (
    <div className="flex gap-2">
      {platforms.map(platform => (
        <button
          key={platform.type}
          onClick={() => onChange(platform.type)}
          className={cn(
            "platform-button",
            value === platform.type && "active"
          )}
          disabled={disabled}
        >
          <span className="icon">{platform.icon}</span>
          <span className="label">{platform.label}</span>
        </button>
      ))}
    </div>
  );
}
```

```tsx
// ElectronPlatformFields.tsx
export function ElectronPlatformFields({ value, onChange, errors, disabled }: FieldRenderProps) {
  const connection = value.connection;
  
  return (
    <>
      <ConnectionTypeSelector
        value={connection.type}
        onChange={(type) => onChange({
          connection: {
            type,
            ...(type === 'cdp' 
              ? { cdpUrl: 'http://localhost:9222' }
              : { executablePath: '' }
            ),
          }
        })}
        disabled={disabled}
      />
      
      {connection.type === 'cdp' ? (
        <Input
          label="CDP WebSocket URL"
          placeholder="http://localhost:9222"
          value={connection.cdpUrl}
          onChange={(cdpUrl) => onChange({ connection: { ...connection, cdpUrl } })}
          error={errors.cdpUrl}
          disabled={disabled}
        />
      ) : (
        <>
          <Input
            label="Executable Path"
            placeholder="/Applications/MyApp.app"
            value={connection.executablePath}
            onChange={(executablePath) => onChange({ connection: { ...connection, executablePath } })}
            error={errors.executablePath}
            disabled={disabled}
          />
          <Input
            label="Launch Arguments (optional)"
            placeholder="--remote-debugging-port=9222"
            value={connection.launchArgs?.join(' ') || ''}
            onChange={(val) => onChange({ 
              connection: { 
                ...connection, 
                launchArgs: val ? val.split(' ') : undefined 
              } 
            })}
            disabled={disabled}
          />
        </>
      )}
      
      <Input
        label="Window Title Filter (optional)"
        placeholder="Main Window"
        value={connection.windowTitle || ''}
        onChange={(windowTitle) => onChange({ connection: { ...connection, windowTitle } })}
        disabled={disabled}
      />
    </>
  );
}
```

**Testing:**
- Manual testing: Switch between platforms
- Verify field validation works
- Test form submission with different configs
- Verify disabled state works correctly

**Success Criteria:**
- ✅ Platform selector renders all platforms
- ✅ Switching platforms changes visible fields
- ✅ Validation errors display correctly
- ✅ Form state persists when switching (with prompt loss warning)
- ✅ UI is responsive and accessible

---

### Phase 3: Backend Integration ⏱️ 3-4 hours

**Files to Update:**
1. `src/application/use-cases/RunUseCase.ts` - Use AppDriverFactory
2. `electron/router.ts` - Accept new schema
3. `src/infrastructure/adapters/drivers/AppDriverFactory.ts` - Enhance as designed
4. `src/infrastructure/adapters/drivers/ElectronDriver.ts` - Handle executable launch

**Key Changes:**

1. **RunUseCase**: Replace direct browser allocation with driver factory
2. **Router**: Update input schema to accept PlatformConfigSchema
3. **ElectronDriver**: Add executable launch support (if not exists)

**Executable Launch Implementation:**

```typescript
// In ElectronDriver.connect()
if (config.executablePath) {
  // Launch the Electron app with remote debugging
  const { spawn } = require('child_process');
  
  const args = [
    ...(config.launchArgs || []),
    '--remote-debugging-port=9222',
  ];
  
  const proc = spawn(config.executablePath, args, {
    detached: true,
    stdio: 'ignore',
  });
  
  proc.unref(); // Don't wait for it
  
  // Wait for CDP to be available
  await this.waitForCDP('http://localhost:9222');
  
  // Continue with CDP connection
  config.cdpUrl = 'http://localhost:9222';
}
```

**Testing:**
- Test web flow (regression)
- Test Electron CDP connection
- Test Electron executable launch
- Test error handling for each path

**Success Criteria:**
- ✅ Web tests work exactly as before
- ✅ Electron CDP connection works
- ✅ Electron executable launch works
- ✅ Proper error messages for connection failures
- ✅ All tests pass

---

### Phase 4: Testing & Polish ⏱️ 2-3 hours

**Test Scenarios:**

1. **Web Platform**
   - Enter google.com → Should auto-prefix https://
   - Empty URL → Should show error
   - Valid test → Should execute normally

2. **Electron Platform - CDP Mode**
   - Valid CDP URL → Should connect
   - Invalid CDP URL → Should show error
   - Connection refused → Should show helpful error

3. **Electron Platform - Executable Mode**
   - Valid .exe path → Should launch and connect
   - Invalid path → Should show error
   - Launch failure → Should show helpful error

4. **Edge Cases**
   - Switch platforms mid-form → Should clear config
   - Submit with validation errors → Should prevent submission
   - Cancel running test → Should work regardless of platform

**Polish Items:**
- Improve error messages
- Add loading states
- Add tooltips/help text
- Improve accessibility (keyboard navigation)
- Add "Learn More" links for each platform

**Success Criteria:**
- ✅ All test scenarios pass
- ✅ Error messages are clear and actionable
- ✅ UI is polished and professional
- ✅ No console errors or warnings
- ✅ Documentation updated

---

## Migration Strategy

### Backward Compatibility

During migration, support both old and new input formats:

```typescript
// Router compatibility layer
const normalizeInput = (input: any): RunTestInput => {
  // Old format: { url, prompt, options }
  if ('url' in input && !('platformConfig' in input)) {
    return {
      platformConfig: {
        platform: 'web',
        url: input.url,
        prompt: input.prompt,
      },
      options: input.options,
    };
  }
  
  // New format
  return input;
};
```

### Rollout Plan

1. **Development**: Implement all phases
2. **Testing**: Comprehensive testing in dev
3. **Staging**: Deploy to staging branch
4. **Production**: Merge to main, announce new features

---

## Future Extensions

### Adding Mobile Platform (Example)

1. **Add Type:**
```typescript
export interface MobilePlatformConfig extends BasePlatformConfig {
  platform: 'mobile';
  device: {
    platform: 'ios' | 'android';
    deviceId: string;
    appId: string;
  };
}
```

2. **Add Schema:**
```typescript
export const MobileConfigSchema = z.object({
  platform: z.literal('mobile'),
  device: z.object({
    platform: z.enum(['ios', 'android']),
    deviceId: z.string(),
    appId: z.string(),
  }),
  prompt: z.string().trim().min(1),
});
```

3. **Add to Registry:**
```typescript
mobile: {
  type: 'mobile',
  label: 'Mobile App',
  description: 'Test iOS and Android applications',
  icon: '📱',
  schema: MobileConfigSchema.omit({ prompt: true }),
  renderFields: MobilePlatformFields,
  defaultValues: { device: { platform: 'android', deviceId: '', appId: '' } },
}
```

4. **Implement Driver:**
```typescript
case 'mobile':
  driver = container.resolve(MobileDriver);
  break;
```

**That's it!** The rest of the system adapts automatically thanks to discriminated unions.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing tests | Medium | High | Backward compatibility layer |
| Type system complexity | Low | Medium | Clear documentation, examples |
| UI becomes cluttered | Medium | Medium | Progressive disclosure, good UX design |
| Performance regression | Low | Low | Minimal overhead, factory pattern is efficient |
| Electron launch failures | Medium | High | Comprehensive error handling, fallback modes |

---

## Success Metrics

- ✅ Zero TypeScript compilation errors
- ✅ All existing tests pass
- ✅ New platform tests pass
- ✅ Code coverage >80%
- ✅ UI loads in <200ms
- ✅ Platform switching in <50ms
- ✅ Clear error messages for all failure modes
- ✅ Documentation complete and accurate

---

## Conclusion

This design provides a robust, type-safe, and extensible foundation for multi-platform support. The discriminated union + registry pattern ensures compile-time safety while maintaining flexibility for future platforms. Each layer is properly separated, testable, and follows SOLID principles.

**Estimated Total Time**: 11-15 hours of focused development

**Next Steps**:
1. Review and approve this plan
2. Begin Phase 1 implementation
3. Incremental review after each phase
4. Final integration and testing

---

## Appendix: File Structure

```
src/
├── domain/
│   └── types/
│       └── PlatformConfig.ts          [NEW]
├── shared/
│   └── validation/
│       ├── index.ts                   [UPDATED]
│       └── platforms/
│           ├── web.ts                 [NEW]
│           └── electron.ts            [NEW]
├── application/
│   ├── dtos.ts                        [UPDATED]
│   └── use-cases/
│       └── RunUseCase.ts          [UPDATED]
├── infrastructure/
│   └── adapters/
│       └── drivers/
│           ├── AppDriverFactory.ts    [UPDATED]
│           ├── WebDriver.ts           [NO CHANGE]
│           └── ElectronDriver.ts      [UPDATED]
└── presentation/
    ├── config/
    │   └── platformRegistry.tsx       [NEW]
    ├── components/
    │   ├── RunForm.tsx               [UPDATED]
    │   └── platform/
    │       ├── PlatformSelector.tsx   [NEW]
    │       ├── WebPlatformFields.tsx  [NEW]
    │       ├── ElectronPlatformFields.tsx [NEW]
    │       └── ConnectionTypeSelector.tsx [NEW]
    └── stores/
        └── useRunStore.ts         [UPDATED]
```

**Lines of Code Estimate:**
- New code: ~1,200 lines
- Modified code: ~400 lines
- Total impact: ~1,600 lines

---

*This document is a living guide. Update as implementation progresses.*
