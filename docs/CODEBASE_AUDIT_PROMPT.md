# Codebase Audit Prompt

Use this prompt to instruct an LLM to systematically audit and clean a codebase.
Copy-paste into a new session, adapting the `[PROJECT CONTEXT]` section to match the target project.

---

## The Prompt

```
You are a senior software engineer performing a systematic codebase audit. Your goal is to identify and fix all dead code, legacy patterns, redundant abstractions, unsafe code, and clutter — then execute the changes with full validation.

## [PROJECT CONTEXT]
- Project: [name]
- Stack: [TypeScript/Python/etc], [frameworks], [test runner]
- Validation commands: [typecheck cmd], [test cmd], [lint cmd]
- Architecture rules: [any guardrail scripts or lint rules]

## METHODOLOGY

### Phase 1 — Directory Mapping (Read-Only)
Map the full directory tree recursively. Count source files, test files, config files.
Produce a table:
| Layer | Directory | File Count |
Goal: Understand the full scope before touching anything.

### Phase 2 — Barrel Export Inventory (Read-Only)
Read every index.ts / barrel file. List every exported symbol.
For each exported symbol, grep the codebase to verify it has at least one consumer outside its own file.
Flag any symbol exported but never imported elsewhere.

### Phase 3 — Dead Marker Scan (Read-Only)
Search the entire codebase for:
- TODO, FIXME, HACK, XXX, DEPRECATED, LEGACY, @deprecated
- console.log / console.warn / console.error outside of logger implementations
- eslint-disable comments (each one is a potential code smell)
- Type assertions: `as any`, `as unknown as`, `!` non-null assertions
List every hit with file:line and classify as: actionable / acceptable / needs-discussion.

### Phase 4 — Dead Code Detection (Read-Only)
For EVERY exported function, class, type, interface, enum, and constant:
1. Grep for its name across the entire codebase
2. If it only appears in its own file (declaration + test) → flag as dead
3. If it appears in a test but nowhere in production code → flag as test-only artifact

Check specifically:
- Enum values that are declared but never matched/used
- Interface methods that are declared but no implementation calls them
- Event types in discriminated unions that are never emitted
- Service methods that are never called outside the service itself
- Constructor parameters that are injected but never used

### Phase 5 — Dependency Audit (Read-Only)
For every dependency in package.json (or equivalent):
1. Grep for any import/require of that package
2. If zero imports → flag as unused
3. If imported but the imported symbol is never called → flag as effectively unused

### Phase 6 — Redundant Abstraction Detection (Read-Only)
Identify:
- **Pass-through services**: Class A.method() just calls B.method() with no added logic
- **Single-implementation interfaces**: Interface with exactly one implementation and no test mocks → may be over-abstraction
- **Wrapper functions**: Functions that just wrap another function with no transformation
- **Re-export chains**: A exports from B which exports from C
- **Config/type mismatches**: Schema declares narrower types than runtime code actually supports

### Phase 7 — Unsafe Pattern Detection (Read-Only)
Search for:
- `any` types (each needs justification or replacement)
- Unchecked `.catch(() => {})` or empty catch blocks
- `try/catch` that swallows errors silently
- Retry loops without backoff or attempt limits
- `setTimeout`/`setInterval` without cleanup
- Race conditions: shared mutable state accessed from async code without synchronization
- Magic numbers/strings without named constants
- Non-exhaustive switch statements on discriminated unions (missing `default` or missing cases)

### Phase 8 — Test Health Audit (Read-Only)
- Count total tests, check for `.skip`, `xit`, `xdescribe`, `xtest`
- Identify test files that import production code that no longer exists
- Flag tests that mock everything (no real logic tested)
- Check test naming conventions for consistency

### Phase 9 — Architecture Compliance (Read-Only)
- Verify layer boundaries: domain must not import from infrastructure/presentation
- Check for circular dependencies between modules
- Verify DI registrations match actual consumption (registered but never resolved = dead)
- Run any project-specific architecture/lint scripts

---

## EXECUTION RULES

### Ranking
After completing all phases, produce a RANKED findings table:
| # | Priority | Category | File(s) | Description | Lines Affected |

Priority levels:
- 🔴 HIGH: Dead code, unused dependencies, type safety gaps
- 🟠 MEDIUM: Redundant abstractions, config mismatches
- 🟢 LOW: Comment rewording, minor style issues

### Execution Order
1. Execute ALL items in a single commit (or ask user preference)
2. After every file edit, do NOT proceed to the next item until the current edit compiles
3. After all edits, run the full validation suite:
   - Type checker
   - All unit tests
   - All integration tests
   - Architecture/lint scripts
4. If any validation fails, fix it before committing
5. Show final diff summary: files changed, insertions, deletions

### Anti-Patterns to Avoid
- Do NOT suggest changes without executing them
- Do NOT skip a file because "it looks fine" — read every file
- Do NOT remove code that is only used in tests (tests are consumers)
- Do NOT remove code that is used via dependency injection token strings
- Do NOT remove interfaces that serve as DI contracts even with single implementation
- Do NOT assume barrel re-exports are unused — check transitive consumers
- Do NOT conflate "used as a type" with "used as a value" in TypeScript
- Do NOT remove event types from discriminated unions without checking ALL consumers including switch statements that may need updating

### What Counts as Dead Code
✅ Remove: Function/class/type exported but imported nowhere
✅ Remove: Enum value declared but never referenced
✅ Remove: npm dependency with zero imports
✅ Remove: Method on a class never called outside that class
✅ Remove: Event type in a union that is never emitted AND never matched

❌ Keep: Interface with single implementation used as DI token
❌ Keep: Type used only in test files (tests are valid consumers)
❌ Keep: Event type that IS matched in switch/if even if never emitted yet (future-proofing)
❌ Keep: Deprecated code with active migration path documented
```

---

## Usage Notes

1. **Scope control**: For large codebases, add `Focus on src/[specific-folder]/ only` to limit scope
2. **Incremental runs**: After one pass, re-run the prompt — each pass finds things the previous missed
3. **Team review**: Ask the LLM to output findings as a table first, get team sign-off, then execute
4. **CI integration**: Ask the LLM to add the dead-code checks as scripts in `package.json` for ongoing enforcement
