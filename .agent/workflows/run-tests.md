---
description: How to run tests
---

# Running Tests

// turbo-all

---

## Quick Commands

```bash
# All unit tests
npm run test

# Watch mode (re-run on file change)
npm run test:watch

# With coverage report
npm run test:coverage

# Integration tests (requires Playwright)
npm run test:integration

# E2E tests
npm run test:e2e

# Type checking
npm run typecheck

# Lint
npm run lint

# All checks (CI equivalent)
npm run test && npm run typecheck && npm run lint
```

---

## Run Specific Tests

```bash
# By file pattern
npm run test -- --grep "Url"

# By file path
npm run test -- src/domain/value-objects/Url.test.ts

# Integration only
npm run test:integration -- --grep "Playwright"
```

---

## Coverage

```bash
npm run test:coverage
```

Opens `coverage/index.html` in browser. Targets:

| Layer | Target |
|-------|--------|
| Domain | 100% |
| Application | 90% |
| Infrastructure | 80% |

---

## Debugging Tests

```bash
# Run with debugger
npm run test -- --inspect-brk

# Verbose output
npm run test -- --reporter=verbose
```

---

## Before Committing

```bash
npm run test && npm run typecheck && npm run lint
```

CI will fail if any of these fail.
