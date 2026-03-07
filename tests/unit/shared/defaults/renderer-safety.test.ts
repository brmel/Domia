import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, '../../../../src');

const NODE_BUILTINS = /^\s*import\s+.*\bfrom\s+['"](?:node:|os|path|fs|child_process|crypto|net|http|https|stream|util|events|buffer|url|querystring|assert|tls|dgram|dns|cluster|readline|vm|v8|perf_hooks|worker_threads|inspector)(?:\/[^'"]*)?['"]/gm;

function readSource(relPath: string): string {
    return readFileSync(resolve(srcRoot, relPath), 'utf-8');
}

describe('shared/defaults barrel – renderer safety', () => {
    const barrelExportedFiles = [
        'shared/defaults/agent.defaults.ts',
        'shared/defaults/tools.defaults.ts',
        'shared/defaults/platform.defaults.ts',
        'shared/defaults/persistence.defaults.ts',
        'shared/defaults/logging.defaults.ts',
    ];

    for (const file of barrelExportedFiles) {
        it(`${file} does not import Node.js builtins`, () => {
            const source = readSource(file);
            const matches = source.match(NODE_BUILTINS);
            expect(matches, `Found Node.js builtin imports in ${file}: ${matches?.join(', ')}`).toBeNull();
        });
    }

    it('barrel index only re-exports renderer-safe modules', () => {
        const barrel = readSource('shared/defaults/index.ts');
        expect(barrel).not.toContain('plugin.defaults');
    });

    it('config-types.ts does not import Node.js builtins directly', () => {
        const source = readSource('shared/config-types.ts');
        const matches = source.match(NODE_BUILTINS);
        expect(matches, `Found Node.js builtin imports in config-types.ts: ${matches?.join(', ')}`).toBeNull();
    });
});
