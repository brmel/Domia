#!/usr/bin/env node
// Boundary guard (rules D1–D7 + god-file + internal-privacy). CI gate.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PKGS = join(ROOT, 'packages');
const GOD_FILE_LINES = 300;

// D1/D2: any package may import contracts+kernel; never another domain package.
// D3(+D13): cli/ui import contracts + the hosts boot entry only.
// D5: hosts import anything.
const ALLOWED = {
  contracts: [],
  kernel: ['contracts'],
  trace: ['contracts', 'kernel'],
  store: ['contracts', 'kernel'],
  tools: ['contracts', 'kernel'],
  agent: ['contracts', 'kernel'],
  case: ['contracts', 'kernel'],
  plan: ['contracts', 'kernel'],
  memory: ['contracts', 'kernel'],
  skills: ['contracts', 'kernel'],
  loop: ['contracts', 'kernel'],
  api: ['contracts', 'kernel'],
  audit: ['contracts', 'kernel'],
  ui: ['contracts'],
  cli: ['contracts', 'hosts'],
  'domia-mcp': ['contracts', 'api'],
  conformance: ['contracts', 'kernel'],
  hosts: '*',
};
// D7: contracts may import only these externals.
const CONTRACTS_EXTERNALS = new Set(['zod', 'neverthrow']);
const NODE_BUILTIN = /^(node:|fs$|path$|os$|crypto$|child_process$|stream$|util$|url$|http$|https$|net$)/;

const errors = [];

function* tsFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') yield* tsFiles(p); }
    else if (e.name.endsWith('.ts')) yield p;
  }
}

function pkgOf(path) {
  const rel = relative(PKGS, path);
  const parts = rel.split('/');
  return parts[0] === 'hosts' ? 'hosts' : parts[0];
}

const IMPORT_RE = /(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const dirent of readdirSync(PKGS, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const pkgDir = join(PKGS, dirent.name);
  let src;
  try { src = statSync(join(pkgDir, 'src')).isDirectory() ? join(pkgDir, 'src') : null; } catch { src = null; }
  const roots = src ? [src] : dirent.name === 'hosts'
    ? readdirSync(pkgDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(pkgDir, d.name, 'src')).filter(p => { try { return statSync(p).isDirectory(); } catch { return false; } })
    : [];
  for (const root of roots) {
    for (const file of tsFiles(root)) {
      const pkg = pkgOf(file);
      const allowed = ALLOWED[pkg];
      const text = readFileSync(file, 'utf8');
      const relFile = relative(ROOT, file);

      const lines = text.split('\n').length;
      if (lines > GOD_FILE_LINES) errors.push(`god-file: ${relFile} has ${lines} lines (max ${GOD_FILE_LINES})`);

      for (const m of text.matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2];
        if (!spec) continue;
        if (spec.startsWith('.')) {
          if (spec.includes('/internal/') && !file.includes('/internal/')) { /* same-pkg relative always fine */ }
          continue;
        }
        const domia = spec.match(/^@domia\/([\w-]+)/)?.[1];
        if (domia) {
          if (allowed !== '*' && domia !== pkg && !allowed.includes(domia))
            errors.push(`boundary: ${relFile} imports @domia/${domia} (allowed: ${allowed.join(', ') || 'none'})`);
          if (spec.includes('/internal/'))
            errors.push(`internal-privacy: ${relFile} imports ${spec}`);
          if (spec.split('/').length > 2 && !spec.includes('/internal/'))
            errors.push(`exports: ${relFile} deep-imports ${spec} (only package index is public)`);
          continue;
        }
        if (pkg === 'contracts') {
          if (NODE_BUILTIN.test(spec)) errors.push(`D7: contracts imports node builtin '${spec}' in ${relFile}`);
          else if (!CONTRACTS_EXTERNALS.has(spec)) errors.push(`D7: contracts imports '${spec}' in ${relFile}`);
        }
        if (pkg === 'ui' && NODE_BUILTIN.test(spec)) errors.push(`ui-no-node: ${relFile} imports '${spec}'`);
      }
    }
  }
}

if (errors.length) {
  console.error(`check-modules: ${errors.length} violation(s)\n` + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('check-modules: OK');
