# Testing Strategy

Testing approach for each architectural layer.

---

## Test Pyramid

```
        ┌─────────┐
        │   E2E   │  Few, slow, high confidence
        ├─────────┤
        │  Integ  │  Some, medium speed
        ├─────────┤
        │  Unit   │  Many, fast, isolated
        └─────────┘
```

| Layer | Test Type | Dependencies | Coverage Target |
|-------|-----------|--------------|-----------------|
| Domain | Unit | None | 100% |
| Application | Unit | Mocked ports | 90% |
| Infrastructure | Integration | Real services | 80% |
| Presentation | E2E | Full app | Critical paths |

---

## Domain Tests (Unit)

Pure functions, no mocks needed.

```typescript
// src/domain/value-objects/Url.test.ts
import { describe, it, expect } from 'vitest';
import { Url } from './Url';

describe('Url', () => {
  it('creates valid URL', () => {
    const result = Url.create('https://example.com');
    expect(result.isOk()).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = Url.create('not-a-url');
    expect(result.isErr()).toBe(true);
  });
});
```

---

## Application Tests (Unit + Mocked Ports)

Mock all ports using neverthrow helpers.

```typescript
// src/application/use-cases/RunUseCase.test.ts
import { describe, it, expect, vi } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import { RunUseCase } from './RunUseCase';

describe('RunUseCase', () => {
  const mockInput: IInputPort = {
    parse: vi.fn().mockReturnValue(ok({ url: 'https://test.com', prompt: 'test' }))
  };
  
  const mockBrowser: IBrowserAutomation = {
    navigateTo: vi.fn().mockReturnValue(okAsync(undefined)),
    snapshot: vi.fn().mockReturnValue(okAsync(mockSnapshot))
  };
  
  it('executes successfully', async () => {
    const useCase = new RunUseCase(mockInput, mockOutput, mockBrowser, mockLlm);
    const result = await useCase.execute({ url: 'https://test.com', prompt: 'test' });
    expect(result.isOk()).toBe(true);
  });
});
```

---

## Infrastructure Tests (Integration)

Test against real services where feasible.

```typescript
// src/infrastructure/adapters/browser/PlaywrightAdapter.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PlaywrightAdapter } from './PlaywrightAdapter';
import { Url } from '@domain/value-objects/Url';

describe('PlaywrightAdapter', () => {
  let adapter: PlaywrightAdapter;

  beforeAll(async () => {
    adapter = new PlaywrightAdapter();
    await adapter.launch({ headless: true });
  });

  afterAll(async () => {
    await adapter.close();
  });

  it('navigates to URL', async () => {
    const url = Url.unsafe('https://example.com');
    const result = await adapter.navigateTo(url);
    expect(result.isOk()).toBe(true);
  });
});
```

---

## E2E Tests (Playwright Test)

Full application flows.

```typescript
// e2e/run-test.spec.ts
import { test, expect } from '@playwright/test';

test('runs a test from UI', async ({ page }) => {
  await page.goto('app://./index.html');
  await page.fill('[data-testid="url-input"]', 'https://example.com');
  await page.fill('[data-testid="prompt-input"]', 'Verify page loads');
  await page.click('[data-testid="run-button"]');
  await expect(page.locator('[data-testid="status"]')).toContainText('passed', { timeout: 30000 });
});
```

---

## Commands

```bash
npm run test              # Unit tests
npm run test:integration  # Integration tests
npm run test:e2e          # E2E tests
npm run test:coverage     # Coverage report
```

---

## Mocking Pattern

Use factory functions for consistent mocks:

```typescript
// tests/mocks/ports.ts
import { okAsync } from 'neverthrow';

export const createMockBrowser = (overrides = {}): IBrowserAutomation => ({
  launch: vi.fn().mockReturnValue(okAsync(undefined)),
  navigateTo: vi.fn().mockReturnValue(okAsync(undefined)),
  click: vi.fn().mockReturnValue(okAsync(undefined)),
  snapshot: vi.fn().mockReturnValue(okAsync(mockSnapshot)),
  close: vi.fn().mockResolvedValue(undefined),
  ...overrides
});
```
