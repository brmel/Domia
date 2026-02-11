# Known Warnings

This document tracks intentional warnings that cannot or should not be fixed at this time.

---

## TypeScript Deprecation Warning

**File**: `tsconfig.json`  
**Line**: 31  
**Warning**: `Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0`

### Context

The `baseUrl` option is used in conjunction with `paths` to enable path aliases like `@domain/*`, `@application/*`, etc. TypeScript is deprecating this approach in favor of Node.js package.json `imports` field.

### Why We Can't Fix It Now

1. **TypeScript 5.x Limitation**: Current TypeScript version (5.9.3) doesn't fully support package.json `imports` for type resolution
2. **Breaking Change**: Removing `baseUrl` would break all 84 import statements across the codebase
3. **Not Yet Released**: TypeScript 7.0 hasn't been released, so there's no clear migration path

### Current Approach

We use the **traditional `baseUrl` + `paths`** configuration:
- ✅ Works perfectly with current TypeScript version
- ✅ Provides excellent IDE autocomplete
- ✅ Zero runtime issues
- ⚠️ Shows deprecation warning (informational only)

### Future Migration Plan

When TypeScript 7.0 is released:

1. **Update TypeScript**: `npm install typescript@^7.0.0`
2. **Remove from tsconfig.json**:
   ```json
   - "baseUrl": ".",
   - "paths": { ... }
   ```
3. **Add to package.json**:
   ```json
   "imports": {
     "#domain/*": "./src/domain/*",
     "#application/*": "./src/application/*",
     ...
   }
   ```
4. **Update all imports**: 
   ```typescript
   - import { X } from '@domain/...'
   + import { X } from '#domain/...'
   ```

### Decision

**Status**: ACCEPTED  
**Reason**: Informational warning only, no impact on functionality  
**Review Date**: When TypeScript 7.0 is released

---

## Summary

- **Total Warnings**: 1
- **Fixable Now**: 0
- **Deferred**: 1 (TypeScript upgrade required)
- **Last Updated**: February 11, 2026

---

*This document should be reviewed quarterly or when TypeScript major versions are released.*
