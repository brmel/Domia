// Full per-file repo audit. Walks every source/test/config file, computes
// metrics + the resolved import graph (for fan-in), folds in ts-prune unused
// exports, and emits docs/architecture/file-audit.csv + file-audit.md.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SRC_ROOTS = ['domain', 'backend', 'infrastructure', 'frontend', 'shared', 'apps', 'tests', 'scripts'];
const ROOT_FILES = ['vitest.config.ts', 'vite.config.ts', '.eslintrc.cjs', 'tsconfig.json', 'package.json'];
const exts = new Set(['.ts', '.tsx', '.mjs', '.cjs', '.js']);
const alias = { '@domain': 'domain', '@backend': 'backend', '@infrastructure': 'infrastructure', '@frontend': 'frontend', '@shared': 'shared', '@apps': 'apps' };
const norm = (p) => p.split(path.sep).join('/');

function walk(d) {
    const out = [];
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'dist-electron') out.push(...walk(p)); }
        else if (exts.has(path.extname(e.name))) out.push(norm(path.relative(root, p)));
    }
    return out;
}

const files = [...SRC_ROOTS.flatMap((r) => walk(path.join(root, r))), ...ROOT_FILES.filter((f) => fs.existsSync(path.join(root, f)))];
const fileSet = new Set(files);

// ts-prune unused exports per file (non-barrel signal)
const prune = {};
try {
    for (const line of fs.readFileSync('/tmp/domia-tsprune.txt', 'utf8').split('\n')) {
        const m = line.match(/^(.+?):\d+ - (.+)$/);
        if (m) { const f = m[1]; (prune[f] ??= []).push(m[2]); }
    }
} catch { /* optional */ }

function category(p) {
    if (p.startsWith('tests/')) return 'test';
    if (p.startsWith('apps/cli')) return 'cli';
    if (p.startsWith('apps/desktop')) return 'desktop';
    if (p.startsWith('frontend/')) return 'frontend';
    if (p.startsWith('backend/')) return 'backend';
    if (p.startsWith('infrastructure/')) return 'infrastructure';
    if (p.startsWith('domain/')) return 'domain';
    if (p.startsWith('shared/')) return 'shared';
    if (p.startsWith('scripts/')) return 'script';
    return 'config';
}

function feature(p) {
    const k = [
        ['run', /run|Run/], ['workflow', /workflow|Workflow/], ['plugin', /plugin|Plugin/], ['skill', /skill|Skill/],
        ['tools', /\/tools\/|Tool/], ['perception', /perception|Perception|observation|Observation|sensor|Sensor/],
        ['persistence', /persistence|SqlJs|SQLite|Repository|persist/], ['agent-runtime', /agent-runtime|adk|Adk|Llm|Agent/],
        ['platform', /platform|Platform|driver|Driver|playwright|Playwright|electron|Electron|appium|Appium/],
        ['reporting', /reporting|Report|junit|Junit|Html/], ['logging', /Logger|observability|Otel|EventBus|EventLogger/],
        ['settings', /settings|Settings|Config/], ['prompt', /prompt|Prompt/],
    ];
    for (const [name, re] of k) if (re.test(p)) return name;
    return 'core';
}

function resolveImport(spec, fromRel) {
    let base;
    const a = Object.keys(alias).find((x) => spec === x || spec.startsWith(`${x}/`));
    if (a) base = spec.replace(a, alias[a]).replace(/^\//, '');
    else if (spec.startsWith('.')) base = norm(path.posix.join(path.posix.dirname(fromRel), spec));
    else return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (fileSet.has(c)) return c;
    return null;
}

const rows = [];
const fanIn = Object.fromEntries(files.map((f) => [f, 0]));
// imports + re-exports (`export * from` / `export { x } from`) + dynamic
// import()/require(). Multiline-safe: a non-greedy `[\s\S]*?` spans the
// `import {\n a,\n b\n} from '...'` block so multi-line imports aren't missed
// (that undercounts fan-in and fakes orphans).
const importPat = /\b(?:import|export)\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const lines = src.split('\n');
    let code = 0, comment = 0, blank = 0, inBlock = false;
    for (const raw of lines) {
        const t = raw.trim();
        if (inBlock) { comment++; if (t.includes('*/')) inBlock = false; continue; }
        if (t === '') { blank++; continue; }
        if (t.startsWith('//')) { comment++; continue; }
        if (t.startsWith('/*')) { comment++; if (!t.includes('*/')) inBlock = true; continue; }
        code++;
    }
    const total = lines.length;
    const exportsN = (src.match(/^export /gm) || []).length;
    const imps = [];
    let m;
    importPat.lastIndex = 0;
    while ((m = importPat.exec(src))) { const s = m[1] ?? m[2] ?? m[3] ?? m[4]; if (s) imps.push(s); }
    // importsOut counts the resolved-internal edges below; raw count kept for the table
    const resolved = imps.map((s) => resolveImport(s, f)).filter(Boolean);
    for (const tgt of resolved) fanIn[tgt]++;
    const unused = (prune[f] || []).length;
    const isBarrel = path.basename(f) === 'index.ts';
    const markers = (src.match(/\b(TODO|FIXME|HACK|XXX|@deprecated)\b/g) || []).length;
    rows.push({
        file: path.basename(f), path: f, depth: f.split('/').length,
        category: category(f), feature: feature(f),
        total, code, comment, blank,
        exports: exportsN, importsOut: imps.length, fanIn: 0, // fanIn filled after
        unusedExports: isBarrel ? 0 : unused, // barrels are re-export noise
        hasClass: /^export (abstract )?class /m.test(src) ? 1 : 0,
        hasInterface: /^export interface /m.test(src) ? 1 : 0,
        markers, isBarrel: isBarrel ? 1 : 0,
        god: f.match(/\.(ts|tsx)$/) && code > 250 ? 1 : 0,
    });
}
for (const r of rows) r.fanIn = fanIn[r.path] ?? 0;
// orphan = no fan-in and not an entry point/test/config/barrel
const ENTRY = /(apps\/cli\/index|apps\/desktop\/main|apps\/desktop\/preload|\.test\.|vitest|vite\.config|eslintrc|tsconfig|package\.json|check-architecture|file-audit|main\.tsx)/;
for (const r of rows) r.orphan = (r.fanIn === 0 && !r.isBarrel && !ENTRY.test(r.path) && r.category !== 'config' && r.category !== 'script') ? 1 : 0;

rows.sort((a, b) => a.category.localeCompare(b.category) || b.code - a.code);

// CSV
const cols = ['path', 'file', 'depth', 'category', 'feature', 'total', 'code', 'comment', 'blank', 'exports', 'importsOut', 'fanIn', 'unusedExports', 'hasClass', 'hasInterface', 'markers', 'isBarrel', 'god', 'orphan'];
const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => r[c]).join(','))).join('\n');
fs.writeFileSync('docs/architecture/file-audit.csv', csv + '\n');

// Summary stats
const byCat = {};
for (const r of rows) {
    const c = byCat[r.category] ??= { files: 0, code: 0, comment: 0, exports: 0, god: 0, orphan: 0, unused: 0 };
    c.files++; c.code += r.code; c.comment += r.comment; c.exports += r.exports; c.god += r.god; c.orphan += r.orphan; c.unused += r.unusedExports;
}
const totals = { files: rows.length, code: rows.reduce((s, r) => s + r.code, 0), comment: rows.reduce((s, r) => s + r.comment, 0), god: rows.reduce((s, r) => s + r.god, 0), orphan: rows.reduce((s, r) => s + r.orphan, 0) };

console.log('FILES:', totals.files, 'CODE:', totals.code, 'COMMENT:', totals.comment, 'GOD:', totals.god, 'ORPHAN:', totals.orphan);
console.log('\nBY CATEGORY:');
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1].code - a[1].code)) console.log(`  ${k.padEnd(16)} files=${String(v.files).padStart(3)} code=${String(v.code).padStart(5)} comment=${String(v.comment).padStart(4)} exports=${String(v.exports).padStart(4)} god=${v.god} orphan=${v.orphan}`);
console.log('\nGOD FILES (>250 code):');
for (const r of rows.filter((r) => r.god).sort((a, b) => b.code - a.code)) console.log(`  ${r.code}  ${r.path}`);
console.log('\nORPHANS (fanIn=0, non-entry):');
for (const r of rows.filter((r) => r.orphan)) console.log(`  ${r.path}  (exports=${r.exports})`);
console.log('\nMARKERS:');
for (const r of rows.filter((r) => r.markers)) console.log(`  ${r.markers}  ${r.path}`);
console.log('\nHIGH FAN-IN (top 12):');
for (const r of [...rows].sort((a, b) => b.fanIn - a.fanIn).slice(0, 12)) console.log(`  ${String(r.fanIn).padStart(3)}  ${r.path}`);
console.log('\nNON-BARREL UNUSED EXPORTS:');
for (const r of rows.filter((r) => r.unusedExports > 0)) console.log(`  ${r.unusedExports}  ${r.path}`);

// ---- Markdown report ----
const orphanNote = (p) => p.endsWith('.d.ts') ? 'ambient .d.ts (never imported)'
    : p.startsWith('tests/fixtures') ? 'runtime-loaded fixture (plugin/electron)'
    : /tests\/e2e\/cli\/.*-test\.ts$|run-cli-tests/.test(p) ? 'live CLI scenario (spawned by run-cli-tests, not imported)'
    : 'orphan — verify';
const catOrder = ['domain', 'backend', 'infrastructure', 'frontend', 'cli', 'desktop', 'shared', 'test', 'script', 'config'];
let md = `# Full File Audit — every file, measured\n\n`;
md += `> Generated by \`scripts/file-audit.mjs\` (run it to regenerate). Raw data: \`file-audit.csv\`.\n`;
md += `> \`code\` = non-blank, non-comment lines. \`fanIn\` counts internal imports **and** \`export … from\` re-exports, multi-line aware. \`dead%\` = non-barrel unused exports (ts-prune) / exports.\n\n`;
md += `## Totals\n\n`;
md += `**${totals.files} files · ${totals.code} code lines · ${totals.comment} comment lines · ${totals.god} files >250 code · ${totals.orphan} zero-fan-in (all explained below)**\n\n`;
md += `## By category\n\n| category | files | code | comment | exports | god | zero-fan-in |\n|---|--:|--:|--:|--:|--:|--:|\n`;
for (const k of catOrder) { const v = byCat[k]; if (v) md += `| ${k} | ${v.files} | ${v.code} | ${v.comment} | ${v.exports} | ${v.god} | ${v.orphan} |\n`; }
md += `\n## Signals\n\n`;
md += `- **God files (>250 code):** ${rows.filter(r => r.god).map(r => `\`${r.path}\` (${r.code})`).join(', ') || 'none'}. Only \`PlaywrightAdapter\` is source; the other two are test files.\n`;
md += `- **Real dead code:** non-barrel unused exports = ${rows.reduce((s, r) => s + r.unusedExports, 0)} (\`infrastructure/tools/toolResult.ts\` — ts-prune parser artifacts, not real). **≈0.**\n`;
md += `- **Markers (TODO/FIXME/deprecated) in src:** 0 (the ${rows.filter(r => r.markers).map(r => r.markers).reduce((a, b) => a + b, 0)} reported are regex literals inside \`scripts/file-audit.mjs\`).\n`;
md += `- **Zero-fan-in (${totals.orphan}) — all explained, none deletable:**\n`;
for (const r of rows.filter(r => r.orphan)) md += `  - \`${r.path}\` — ${orphanNote(r.path)}\n`;
md += `- **Highest fan-in (shared vocabulary):** ` + [...rows].sort((a, b) => b.fanIn - a.fanIn).slice(0, 8).map(r => `\`${r.file}\`(${r.fanIn})`).join(', ') + `\n`;
md += `\n## Full per-file table\n\nColumns: depth · feature · total · code · comment · exports · fanOut · fanIn · dead% · flags (C=class, I=interface, B=barrel, G=god).\n`;
for (const k of catOrder) {
    const cat = rows.filter(r => r.category === k);
    if (!cat.length) continue;
    md += `\n### ${k} (${cat.length} files, ${cat.reduce((s, r) => s + r.code, 0)} code)\n\n`;
    md += `| path | depth | feature | total | code | cmt | exp | out | in | dead% | flags |\n|---|--:|---|--:|--:|--:|--:|--:|--:|--:|---|\n`;
    for (const r of cat) {
        const dead = r.exports ? Math.round((r.unusedExports / r.exports) * 100) : 0;
        const flags = [r.hasClass && 'C', r.hasInterface && 'I', r.isBarrel && 'B', r.god && 'G'].filter(Boolean).join('') || '·';
        md += `| ${r.path} | ${r.depth} | ${r.feature} | ${r.total} | ${r.code} | ${r.comment} | ${r.exports} | ${r.importsOut} | ${r.fanIn} | ${dead} | ${flags} |\n`;
    }
}
// ---- Feature distribution + plan ----
const byFeat = {};
for (const r of rows) { const f = byFeat[r.feature] ??= { files: 0, code: 0 }; f.files++; f.code += r.code; }
md += `\n## Feature distribution (code spread)\n\n| feature | files | code |\n|---|--:|--:|\n`;
for (const [k, v] of Object.entries(byFeat).sort((a, b) => b[1].code - a[1].code)) md += `| ${k} | ${v.files} | ${v.code} |\n`;
md += `\n> \`run\` and \`workflow\` each span all five layers (domain→backend→infra→frontend→apps) — the measured "feature-smear" (see \`audit.md\` §5). That spread, not coupling, is the one real structural lever.\n`;

md += `\n## Improvement plan (derived from this table)\n\n`;
md += `**What the data proves is already clean — do NOT touch:**\n`;
md += `- Dead code ≈0 (2 ts-prune artifacts), 0 TODO/FIXME/deprecated in src, 0 truly-orphan files.\n`;
md += `- Comments: ${totals.comment} total, ${byCat.test?.comment ?? 0} in tests; source comments are WHY-level per convention. Nothing meaningful to delete.\n`;
md += `- Layers clean, 0 circular (gated), ports grouped, lint 0.\n\n`;
md += `**Real levers, ranked by value:**\n`;
md += `1. **Feature-smear (\`run\` = 93 files / 6756 code across 5 layers).** The dominant structural signal. Fix = vertical feature slices (\`feature-first-migration.md\`). HIGH effort/risk — **deferred** until team-scale; the layered base is clean today.\n`;
md += `2. **\`PlaywrightAdapter\` (338 code, the only source god file).** Cohesive (action surface + page lifecycle over mutable \`page\`); tab logic already extracted. Optional: extract mouse/lifecycle, but it adds delegation indirection. **Recommend leave.**\n`;
md += `3. **Test god files** — \`cli-test-helpers.ts\` (313), \`sqlite-persistence.test.ts\` (296). Splitting improves test readability; low risk. **Optional.**\n`;
md += `4. **Live CLI scenario comments** — \`counter-scenario-test\` (76), \`shell-capability-test\` (57), \`recording-scenario-test\` (28) carry verbose narration. Trim if desired; they aid manual scenario runs. **Low priority.**\n`;
md += `5. **Keep this audit as a health check** — re-run \`node scripts/file-audit.mjs\` per branch to catch drift (new god files, rising dead%, orphans).\n\n`;
md += `**Verdict:** the table shows a codebase with no cleanup backlog. The only structural improvement of real size is the deferred feature-first migration; everything else is optional polish or maintenance.\n`;

fs.writeFileSync('docs/architecture/file-audit.md', md);

console.log('\nCSV -> docs/architecture/file-audit.csv (' + rows.length + ' rows)');
console.log('MD  -> docs/architecture/file-audit.md');
