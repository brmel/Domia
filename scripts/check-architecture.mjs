import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'src');

const sourceExtensions = new Set(['.ts', '.tsx']);
const runtimeFilePattern = /^(?!.*\.test\.|.*\.integration\.test\.).*\.(ts|tsx)$/;

const violations = [];

const layerRules = [
    {
        name: 'domain-purity',
        scope: /\/src\/domain\//,
        forbiddenImportPatterns: [
            /@infrastructure\//,
            /@presentation\//,
            /@electron\//,
            /\.\.\/\.\.\/infrastructure\//,
            /\.\.\/\.\.\/presentation\//,
            /\.\.\/\.\.\/electron\//
        ]
    },
    {
        name: 'application-boundary',
        scope: /\/src\/application\//,
        forbiddenImportPatterns: [
            /@infrastructure\//,
            /@presentation\//,
            /@electron\//,
            /\.\.\/\.\.\/infrastructure\//,
            /\.\.\/\.\.\/presentation\//,
            /\.\.\/\.\.\/electron\//
        ]
    },
    {
        name: 'presentation-boundary',
        scope: /\/src\/presentation\//,
        forbiddenImportPatterns: [
            /@infrastructure\//,
            /\.\.\/\.\.\/infrastructure\//
        ]
    }
];

const forbiddenRuntimeMarkers = [/\blegacy\b/i, /\bdeprecated\b/i, /\bfallback\b/i];
const allowedMarkerContexts = [
    /userAgentFallback/
];

async function walkFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walkFiles(absolute));
            continue;
        }

        const ext = path.extname(entry.name);
        if (!sourceExtensions.has(ext)) {
            continue;
        }

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
        if (importPath) {
            imports.push(importPath);
        }
    }
    return imports;
}

function applyLayerRules(filePath, imports) {
    for (const rule of layerRules) {
        if (!rule.scope.test(filePath)) {
            continue;
        }

        for (const importPath of imports) {
            const forbidden = rule.forbiddenImportPatterns.find((pattern) => pattern.test(importPath));
            if (forbidden) {
                violations.push(`[${rule.name}] ${filePath} imports forbidden path: ${importPath}`);
            }
        }
    }
}

function applyRuntimeMarkerRules(filePath, content) {
    if (!runtimeFilePattern.test(filePath)) {
        return;
    }

    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';

        for (const marker of forbiddenRuntimeMarkers) {
            if (!marker.test(line)) {
                continue;
            }

            if (allowedMarkerContexts.some((allowPattern) => allowPattern.test(line))) {
                continue;
            }

            violations.push(`[runtime-markers] ${filePath}:${index + 1} contains forbidden marker: ${marker}`);
        }
    }
}

async function main() {
    const files = await walkFiles(srcDir);

    for (const absoluteFilePath of files) {
        const relativePath = normalizePath(path.relative(rootDir, absoluteFilePath));
        const content = await fs.readFile(absoluteFilePath, 'utf8');
        const imports = collectImports(content);
        applyLayerRules(relativePath, imports);
        applyRuntimeMarkerRules(relativePath, content);
    }

    if (violations.length > 0) {
        console.error('Architecture guardrail violations found:');
        for (const violation of violations) {
            console.error(`- ${violation}`);
        }
        process.exit(1);
    }

    console.log('Architecture guardrails passed.');
}

await main();