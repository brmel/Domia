---
description: How to implement a new feature following clean architecture
---

# Implementing a New Feature

This workflow guides you through adding new functionality while maintaining clean architecture.

---

## Pre-Implementation Checklist

1. Identify which layer(s) the feature touches
2. Check if new ports (interfaces) are needed
3. Plan tests for each layer

---

## Step 1: Start with Domain Layer (If Applicable)

// turbo
```bash
ls -la src/domain/entities/
ls -la src/domain/ports/
```

### Create Domain Types with neverthrow

```typescript
// src/domain/value-objects/NewValue.ts
import { Result, ok, err } from 'neverthrow';
import { ValidationError } from '../errors/ValidationError';

export type NewValue = Brand<string, 'NewValue'>;

export const NewValue = {
  create: (value: string): Result<NewValue, ValidationError> => {
    if (!isValid(value)) {
      return err(new ValidationError('Invalid value'));
    }
    return ok(value as NewValue);
  }
};
```

### Create Port with ResultAsync

```typescript
// src/domain/ports/INewCapability.ts
import { ResultAsync } from 'neverthrow';

export interface INewCapability {
  doSomething(input: ValidatedInput): ResultAsync<Output, SomeError>;
}
```

---

## Step 2: Implement Infrastructure Adapter

Create adapter with tsyringe decorator:

```typescript
// src/infrastructure/adapters/NewCapabilityAdapter.ts
import { injectable } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { INewCapability } from '@domain/ports/INewCapability';

@injectable()
export class NewCapabilityAdapter implements INewCapability {
  doSomething(input: ValidatedInput): ResultAsync<Output, SomeError> {
    return ResultAsync.fromPromise(
      externalLibrary.call(input),
      (e) => new SomeError(String(e))
    );
  }
}
```

### Register in DI Container

```typescript
// src/infrastructure/di/container.ts
import { NewCapabilityAdapter } from '../adapters/NewCapabilityAdapter';

container.register('INewCapability', { useClass: NewCapabilityAdapter });
```

---

## Step 3: Create Use Case

```typescript
// src/application/use-cases/NewFeatureUseCase.ts
import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { INewCapability } from '@domain/ports/INewCapability';

@injectable()
export class NewFeatureUseCase {
  constructor(
    @inject('INewCapability') private capability: INewCapability
  ) {}

  execute(command: NewFeatureCommand): ResultAsync<OutputDto, UseCaseError> {
    return this.capability.doSomething(command.input)
      .map(output => this.toDto(output))
      .mapErr(e => new UseCaseError(e.message));
  }
}
```

---

## Step 4: Add Presentation Layer (If UI-Facing)

### IPC Handler

```typescript
// src/presentation/electron/ipc-handlers/NewFeatureHandlers.ts
import { ipcMain } from 'electron';
import { container } from '@infrastructure/di/container';
import { NewFeatureUseCase } from '@application/use-cases/NewFeatureUseCase';

export function registerNewFeatureHandlers(): void {
  ipcMain.handle('new-feature:execute', async (_, args) => {
    const useCase = container.resolve(NewFeatureUseCase);
    const result = await useCase.execute(args);
    return result.match(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error: error.message })
    );
  });
}
```

### zustand Store

```typescript
// src/presentation/renderer/stores/newFeatureStore.ts
import { create } from 'zustand';

interface NewFeatureStore {
  data: OutputDto | null;
  isLoading: boolean;
  execute: (input: string) => Promise<void>;
}

export const useNewFeatureStore = create<NewFeatureStore>((set) => ({
  data: null,
  isLoading: false,
  execute: async (input) => {
    set({ isLoading: true });
    const result = await window.api.newFeature.execute({ input });
    if (result.ok) {
      set({ data: result.value, isLoading: false });
    } else {
      set({ isLoading: false });
      // Handle error
    }
  },
}));
```

---

## Step 5: Write Tests

### Domain Tests (Unit)

```typescript
// src/domain/value-objects/NewValue.test.ts
import { describe, it, expect } from 'vitest';
import { NewValue } from './NewValue';

describe('NewValue', () => {
  it('should create valid value', () => {
    const result = NewValue.create('valid');
    expect(result.isOk()).toBe(true);
  });
  
  it('should reject invalid value', () => {
    const result = NewValue.create('');
    expect(result.isErr()).toBe(true);
  });
});
```

### Application Tests (Mock Ports)

```typescript
// src/application/use-cases/NewFeatureUseCase.test.ts
import { describe, it, expect, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { NewFeatureUseCase } from './NewFeatureUseCase';

describe('NewFeatureUseCase', () => {
  it('should execute successfully', async () => {
    const mockCapability = {
      doSomething: vi.fn().mockReturnValue(okAsync({ data: 'test' }))
    };
    
    const useCase = new NewFeatureUseCase(mockCapability);
    const result = await useCase.execute({ input: 'test' });
    
    expect(result.isOk()).toBe(true);
  });
});
```

// turbo
```bash
npm run test -- --grep "NewFeature"
```

---

## Verification Checklist

- [ ] No import boundary violations (`npm run lint`)
- [ ] All types compile (`npm run typecheck`)
- [ ] Tests pass (`npm run test`)
- [ ] Adapter registered in DI container
- [ ] All async ops use `ResultAsync`, not try/catch
