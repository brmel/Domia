import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const scanRoots = ['domain', 'backend', 'infrastructure', 'frontend', 'shared', 'apps'];

const sourceExtensions = new Set(['.ts', '.tsx']);
const runtimeFilePattern = /^(?!.*\.test\.|.*\.integration\.test\.).*\.(ts|tsx)$/;

const violations = [];

const layerRules = [
    {
        name: 'domain-purity',
        scope: /^domain\//,
        forbiddenImportPatterns: [
            /@backend\//,
            /@infrastructure\//,
            /@frontend\//,
            /@apps\//,
            /\.\.\/\.\.\/backend\//,
            /\.\.\/\.\.\/infrastructure\//,
            /\.\.\/\.\.\/frontend\//,
            /\.\.\/\.\.\/apps\//,
        ],
    },
    {
        name: 'backend-boundary',
        scope: /^backend\/(?!container\/)/,
        forbiddenImportPatterns: [
            /@infrastructure\//,
            /@frontend\//,
            /@apps\//,
            /\.\.\/\.\.\/infrastructure\//,
            /\.\.\/\.\.\/frontend\//,
            /\.\.\/\.\.\/apps\//,
        ],
    },
    {
        name: 'infrastructure-boundary',
        scope: /^infrastructure\//,
        forbiddenImportPatterns: [
            /@backend\//,
            /@frontend\//,
            /@apps\//,
            /\.\.\/\.\.\/backend\//,
            /\.\.\/\.\.\/frontend\//,
            /\.\.\/\.\.\/apps\//,
        ],
    },
    {
        name: 'frontend-boundary',
        scope: /^frontend\//,
        forbiddenImportPatterns: [
            /@infrastructure\//,
            /\.\.\/\.\.\/infrastructure\//,
            // frontend may only touch backend via DTO contract types + the tRPC AppRouter type
            /@backend\/(?!dto)/,
            /@apps\/(?!desktop\/ipc\/router)/,
        ],
    },
    {
        name: 'apps-boundary',
        scope: /^apps\//,
        forbiddenImportPatterns: [
            /@infrastructure\//,
            /\.\.\/\.\.\/infrastructure\//,
        ],
    },
    {
        name: 'desktop-ipc-boundary',
        scope: /^apps\/desktop\/ipc\//,
        forbiddenImportPatterns: [
            /@infrastructure\//,
            /@frontend\//,
            /\.\.\/\.\.\/infrastructure\//,
            /\.\.\/\.\.\/frontend\//,
        ],
    },
    {
        name: 'renderer-no-node-builtins',
        scope: /^frontend\//,
        forbiddenImportPatterns: [
            /^os$/,
            /^path$/,
            /^fs$/,
            /^child_process$/,
            /^crypto$/,
            /^node:/,
        ],
    },
    {
        name: 'shared-defaults-no-node-builtins',
        scope: /^shared\/defaults\//,
        forbiddenImportPatterns: [
            /^os$/,
            /^path$/,
            /^fs$/,
            /^child_process$/,
            /^node:/,
        ],
    },
];

const forbiddenRuntimeMarkers = [/\blegacy\b/i, /\bdeprecated\b/i];

// A constructor past this many injected deps is a fat-orchestrator smell (see the
// RunUseCase 15-dep hub the class-view audit found, now split via RunStepEngine).
// Headroom above today's max (AdkAgentRuntime = 11) so it guards regression, not style.
const MAX_CONSTRUCTOR_INJECTS = 12;

function applyFatConstructorRule(filePath, content) {
    const injectCount = (content.match(/@inject\(/g) || []).length;
    if (injectCount > MAX_CONSTRUCTOR_INJECTS) {
        violations.push(`[fat-constructor] ${filePath} injects ${injectCount} deps (max ${MAX_CONSTRUCTOR_INJECTS}) — extract a sub-facade instead of growing the constructor`);
    }
}

// Headroom above today's max (PlaywrightAdapter ≈ 340) so it guards regression, not style.
const MAX_SOURCE_FILE_LINES = 400;

function applyFileSizeRule(filePath, content) {
    const lineCount = content.split('\n').length;
    if (lineCount > MAX_SOURCE_FILE_LINES) {
        violations.push(`[god-file] ${filePath} has ${lineCount} lines (max ${MAX_SOURCE_FILE_LINES}) — split by concern before it grows further`);
    }
}

async function walkFiles(dir) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
    const files = [];

    for (const entry of entries) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walkFiles(absolute));
            continue;
        }

        const ext = path.extname(entry.name);
        if (!sourceExtensions.has(ext)) continue;

        files.push(absolute);
    }

    return files;
}

function normalizePath(filePath) {
    return filePath.split(path.sep).join('/');
}

function collectImports(content) {
    const imports = [];
    const pattern = /^\s*import(?:\s+type)?\s+[^'"\n]+from\s+['"]([^'"]+)['"];?|^\s*import\s+['"]([^'"]+)['"];?/gm;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1] ?? match[2];
        if (importPath) imports.push(importPath);
    }
    return imports;
}

function applyLayerRules(filePath, imports) {
    for (const rule of layerRules) {
        if (!rule.scope.test(filePath)) continue;

        for (const importPath of imports) {
            const forbidden = rule.forbiddenImportPatterns.find((pattern) => pattern.test(importPath));
            if (forbidden) {
                violations.push(`[${rule.name}] ${filePath} imports forbidden path: ${importPath}`);
            }
        }
    }
}

function applyRuntimeMarkerRules(filePath, content) {
    if (!runtimeFilePattern.test(filePath)) return;

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const trimmed = line.trim();

        if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')) continue;

        for (const marker of forbiddenRuntimeMarkers) {
            if (marker.test(line)) {
                violations.push(`[runtime-markers] ${filePath}:${index + 1} contains forbidden marker: ${marker}`);
            }
        }
    }
}

const aliasMap = {
    '@domain': 'domain',
    '@backend': 'backend',
    '@infrastructure': 'infrastructure',
    '@frontend': 'frontend',
    '@shared': 'shared',
    '@apps': 'apps',
};

function resolveImport(spec, fromRelPath, fileSet) {
    let base;
    const aliasHit = Object.keys(aliasMap).find((a) => spec === a || spec.startsWith(`${a}/`));
    if (aliasHit) {
        base = spec.replace(aliasHit, aliasMap[aliasHit]).replace(/^\//, '');
    } else if (spec.startsWith('.')) {
        base = normalizePath(path.posix.join(path.posix.dirname(fromRelPath), spec));
    } else {
        return null; // external package
    }
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
    return candidates.find((c) => fileSet.has(c)) ?? null;
}

function detectCycles(graph) {
    const WHITE = 0, GREY = 1, BLACK = 2;
    const color = new Map();
    const stack = [];
    const seenCycles = new Set();
    const cycles = [];

    function dfs(node) {
        color.set(node, GREY);
        stack.push(node);
        for (const next of graph.get(node) ?? []) {
            const c = color.get(next) ?? WHITE;
            if (c === GREY) {
                const start = stack.indexOf(next);
                const cycle = stack.slice(start).concat(next);
                const key = [...cycle].sort().join('|');
                if (!seenCycles.has(key)) {
                    seenCycles.add(key);
                    cycles.push(cycle);
                }
            } else if (c === WHITE) {
                dfs(next);
            }
        }
        stack.pop();
        color.set(node, BLACK);
    }

    for (const node of graph.keys()) {
        if ((color.get(node) ?? WHITE) === WHITE) dfs(node);
    }
    return cycles;
}

async function main() {
    const files = (await Promise.all(
        scanRoots.map((root) => walkFiles(path.join(rootDir, root))),
    )).flat();

    const relPaths = files.map((f) => normalizePath(path.relative(rootDir, f)));
    const fileSet = new Set(relPaths);
    const graph = new Map();

    for (const absoluteFilePath of files) {
        const relativePath = normalizePath(path.relative(rootDir, absoluteFilePath));
        const content = await fs.readFile(absoluteFilePath, 'utf8');
        const imports = collectImports(content);
        applyLayerRules(relativePath, imports);
        applyRuntimeMarkerRules(relativePath, content);
        applyFatConstructorRule(relativePath, content);
        applyFileSizeRule(relativePath, content);

        const edges = imports
            .map((spec) => resolveImport(spec, relativePath, fileSet))
            .filter((target) => target && target !== relativePath);
        graph.set(relativePath, edges);
    }

    for (const cycle of detectCycles(graph)) {
        violations.push(`[no-circular-deps] ${cycle.join(' -> ')}`);
    }

    if (violations.length > 0) {
        console.error('Architecture guardrail violations found:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exit(1);
    }

    console.log('Architecture guardrails passed.');
}

await main();
