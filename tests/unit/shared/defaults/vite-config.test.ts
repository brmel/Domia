import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../../../');

describe('vite.config.ts – renderer bundle safety', () => {
    const viteConfig = readFileSync(resolve(projectRoot, 'vite.config.ts'), 'utf-8');

    it('pre-bundles zod to prevent mid-session dep optimization', () => {
        expect(viteConfig).toContain("optimizeDeps");
        expect(viteConfig).toContain("'zod'");
    });

    it('ignores domia.db and artifacts in watch mode', () => {
        expect(viteConfig).toContain('**/domia.db');
        expect(viteConfig).toContain('**/artifacts/**');
    });
});
