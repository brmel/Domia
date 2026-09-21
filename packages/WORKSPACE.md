# Workspace configuration — the root files to write at slice 0

Not code yet — the shape of the buildable monorepo root, so the scaffold is
ready to become real.

## `package.json` (workspaces root)

```jsonc
{
  "name": "domia", "private": true, "type": "module",
  "workspaces": ["packages/*", "packages/hosts/*"],
  "scripts": {
    "typecheck": "tsc -b",
    "check:modules": "node scripts/check-modules.mjs",
    "test": "vitest run",
    "cli": "tsx packages/cli/src/index.ts",
    "desktop": "…electron…",
    "check": "npm run typecheck && npm run check:modules && npm test"
  }
}
```

## `tsconfig.base.json` (strict + path aliases)

```jsonc
{
  "compilerOptions": {
    "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
    "module": "ESNext", "moduleResolution": "Bundler", "target": "ES2022",
    "verbatimModuleSyntax": true, "isolatedModules": true,
    "paths": {
      "@domia/contracts": ["packages/contracts/src"],
      "@domia/kernel": ["packages/kernel/src"],
      "@domia/trace": ["packages/trace/src"],
      "@domia/store": ["packages/store/src"],
      "@domia/tools": ["packages/tools/src"],
      "@domia/agent": ["packages/agent/src"],
      "@domia/case": ["packages/case/src"],
      "@domia/plan": ["packages/plan/src"],
      "@domia/memory": ["packages/memory/src"],
      "@domia/loop": ["packages/loop/src"],
      "@domia/api": ["packages/api/src"],
      "@domia/conformance": ["packages/conformance/src"]
    }
  }
}
```

Each package has its own `tsconfig.json` extending base with `references` to its
runtime deps — but only `contracts` and `kernel` may be referenced by everyone;
domain packages reference only those two (enforced below).

## `scripts/check-modules.mjs` (CI boundary guard — the D1–D7 rules)

Fails the build on:

| Rule | Check |
|---|---|
| D1 | any package may import `@domia/contracts`, `@domia/kernel` |
| D2 | **no package imports another domain package** — grep imports; only contracts/kernel allowed cross-package. Cross-module runtime use must go through `host.resolve(EP.*)` |
| D3 | `ui`/`cli` import only the `DomiaApi` type + a transport client |
| D5 | only `hosts/*` import more than {contracts, kernel} + their own src |
| D7 | `contracts` imports only `zod`, `neverthrow`; no Node builtins |
| god-file | no `src/**/*.ts` over 300 lines |
| internal-privacy | nothing outside a package imports its `src/internal/**` |
| exports | each package's `index.ts` is the only public surface |

Mirrors V1's `scripts/check-architecture.mjs`, retargeted to packages.

## Per-package `package.json` shape

```jsonc
{ "name": "@domia/<pkg>", "type": "module", "main": "src/index.ts",
  "dependencies": { "@domia/contracts": "*", "@domia/kernel": "*" } }
```

Domain packages depend **only** on `@domia/contracts` + `@domia/kernel` in their
manifest — the dependency graph *is* the boundary, and `check:modules` enforces it.
