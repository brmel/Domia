---
description: How to setup the project from scratch
---

# Project Setup

This workflow guides you through initial project setup using the recommended libraries.

// turbo-all

---

## Step 1: Scaffold with electron-vite

```bash
# Create Electron + Vite + React project
npm create @electron-vite/create@latest . -- --template react-ts
```

When prompted, select TypeScript + React.

---

## Step 2: Install Core Dependencies

```bash
# Type-safe error handling
npm install neverthrow

# Dependency injection
npm install tsyringe reflect-metadata

# LLM integration (Google Gemini)
npm install @google/generative-ai

# Browser automation
npm install playwright
npx playwright install chromium

# Storage
npm install better-sqlite3
npm install -D @types/better-sqlite3

# State management
npm install zustand

# Utilities
npm install nanoid
```

---

## Step 3: Configure TypeScript (Strict Mode)

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@domain/*": ["src/domain/*"],
      "@application/*": ["src/application/*"],
      "@infrastructure/*": ["src/infrastructure/*"],
      "@presentation/*": ["src/presentation/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

> [!IMPORTANT]
> `experimentalDecorators` and `emitDecoratorMetadata` are required for tsyringe.

---

## Step 4: Configure tsyringe

Create entry point that imports reflect-metadata:

```typescript
// src/main.ts (or wherever your app starts)
import 'reflect-metadata';
// Rest of your app...
```

---

## Step 5: Setup ESLint Import Boundaries

```bash
npm install -D eslint-plugin-import eslint-import-resolver-typescript
```

Add to `.eslintrc.cjs`:

```javascript
module.exports = {
  plugins: ['import'],
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
  rules: {
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          // Domain can only import neverthrow
          {
            target: './src/domain',
            from: './src/application',
            message: 'Domain cannot import from Application layer',
          },
          {
            target: './src/domain',
            from: './src/infrastructure',
            message: 'Domain cannot import from Infrastructure layer',
          },
          {
            target: './src/domain',
            from: './src/presentation',
            message: 'Domain cannot import from Presentation layer',
          },
          // Application cannot import from infrastructure/presentation
          {
            target: './src/application',
            from: './src/infrastructure',
            message: 'Application cannot import from Infrastructure layer',
          },
          {
            target: './src/application',
            from: './src/presentation',
            message: 'Application cannot import from Presentation layer',
          },
          // Infrastructure cannot import from application/presentation
          {
            target: './src/infrastructure',
            from: './src/application',
            message: 'Infrastructure cannot import from Application layer',
          },
          {
            target: './src/infrastructure',
            from: './src/presentation',
            message: 'Infrastructure cannot import from Presentation layer',
          },
          // Presentation cannot import from infrastructure
          {
            target: './src/presentation',
            from: './src/infrastructure',
            message: 'Presentation cannot import from Infrastructure layer',
          },
        ],
      },
    ],
  },
};
```

---

## Step 6: Create Directory Structure

```bash
# Domain layer
mkdir -p src/domain/{entities,value-objects,ports,events,errors}

# Application layer
mkdir -p src/application/{use-cases,queries,event-handlers,dtos}

# Infrastructure layer
mkdir -p src/infrastructure/{adapters/{browser,llm,storage,events},config,di}

# Presentation layer (already created by electron-vite)
mkdir -p src/presentation/{electron/ipc-handlers,renderer/{components,hooks,stores}}

# Shared
mkdir -p src/shared/{types,constants}
```

---

## Step 7: Create Core Files

### Branded Types

```typescript
// src/domain/value-objects/branded-types.ts
import { Result, ok, err } from 'neverthrow';
import { ValidationError } from '../errors/ValidationError';

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type Url = Brand<string, 'Url'>;
export type ElementId = Brand<number, 'ElementId'>;
export type TestRunId = Brand<string, 'TestRunId'>;

export const Url = {
  create: (value: string): Result<Url, ValidationError> => {
    try {
      new URL(value);
      return ok(value as Url);
    } catch {
      return err(new ValidationError(`Invalid URL: ${value}`));
    }
  },
  unsafe: (value: string): Url => value as Url,
};
```

### Base Domain Error

```typescript
// src/domain/errors/DomainError.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

### DI Container

```typescript
// src/infrastructure/di/container.ts
import 'reflect-metadata';
import { container } from 'tsyringe';

// Import adapters here and register them
// container.register('IBrowserAutomation', { useClass: PlaywrightAdapter });

export { container };
```

---

## Step 8: Setup Testing

```bash
npm install -D vitest @vitest/coverage-v8
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, './src/domain'),
      '@application': path.resolve(__dirname, './src/application'),
      '@infrastructure': path.resolve(__dirname, './src/infrastructure'),
      '@presentation': path.resolve(__dirname, './src/presentation'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Step 9: Verify Setup

```bash
# Check TypeScript
npm run typecheck

# Check linting
npm run lint

# Run tests
npm run test

# Start dev server
npm run dev
```

---

## Verification Checklist

- [ ] Electron window opens with `npm run dev`
- [ ] TypeScript compiles with decorators enabled
- [ ] ESLint runs with import boundary rules
- [ ] Directory structure matches architecture
- [ ] `import 'reflect-metadata'` in entry file
- [ ] Vitest runs sample test
