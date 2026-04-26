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
        name: 'frontend-boundary',
        scope: /^frontend\//,
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
        scope: /^shared\/defaults\/(?!plugin\.)/,
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

async function main() {
    const files = (await Promise.all(
        scanRoots.map((root) => walkFiles(path.join(rootDir, root))),
    )).flat();

    for (const absoluteFilePath of files) {
        const relativePath = normalizePath(path.relative(rootDir, absoluteFilePath));
        const content = await fs.readFile(absoluteFilePath, 'utf8');
        const imports = collectImports(content);
        applyLayerRules(relativePath, imports);
        applyRuntimeMarkerRules(relativePath, content);
    }

    if (violations.length > 0) {
        console.error('Architecture guardrail violations found:');
        for (const violation of violations) console.error(`- ${violation}`);
        process.exit(1);
    }

    console.log('Architecture guardrails passed.');
}

await main();
