import type { RoleRef, RoleRefMap } from '@domain/value-objects/RoleRef';

const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
    'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'option', 'searchbox', 'slider', 'spinbutton', 'switch', 'tab', 'treeitem',
]);

const CONTENT_ROLES = new Set([
    'heading', 'cell', 'gridcell', 'columnheader', 'rowheader',
    'listitem', 'article', 'region', 'main', 'navigation',
]);

function getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/);
    return match?.[1] ? Math.floor(match[1].length / 2) : 0;
}

interface RoleSnapshotResult {
    readonly snapshot: string;
    readonly refs: RoleRefMap;
}

export function buildRoleSnapshot(
    ariaSnapshot: string,
    maxDepth?: number,
): RoleSnapshotResult {
    const lines = ariaSnapshot.split('\n');
    const refs: Record<string, RoleRef> = {};
    const counts = new Map<string, number>();
    const refsByKey = new Map<string, string[]>();
    let counter = 0;

    const result: string[] = [];

    for (const rawLine of lines) {
        const depth = getIndentLevel(rawLine);
        if (maxDepth !== undefined && depth > maxDepth) continue;

        // Playwright YAML-escapes lines containing special chars with single
        // quotes, e.g.  - 'heading "Page: Home" [level=1]'.  Unwrap them.
        let line = rawLine;
        const sqMatch = rawLine.match(/^(\s*-\s*)'(.+)'$/);
        if (sqMatch) line = `${sqMatch[1]}${sqMatch[2]}`;

        // Match both `role "name"` and `role: "name"` (Playwright uses the
        // colon form for roles with text content, e.g. `listitem: "1"`).
        const match = line.match(/^(\s*-\s*)(\w+)(?::?\s+"([^"]*)")?(.*)$/);
        if (!match) {
            result.push(line);
            continue;
        }

        const [, prefix, roleRaw, name, suffix] = match;
        if (!roleRaw || roleRaw.startsWith('/')) {
            result.push(line);
            continue;
        }

        const role = roleRaw.toLowerCase();
        const isInteractive = INTERACTIVE_ROLES.has(role);
        const isContent = CONTENT_ROLES.has(role);
        const shouldHaveRef = isInteractive || (isContent && !!name);

        if (!shouldHaveRef) {
            result.push(line);
            continue;
        }

        counter++;
        const ref = `e${counter}`;
        const key = `${role}:${name ?? ''}`;
        const nth = counts.get(key) ?? 0;
        counts.set(key, nth + 1);

        const list = refsByKey.get(key) ?? [];
        list.push(ref);
        refsByKey.set(key, list);

        refs[ref] = { role, ...(name ? { name } : {}), nth };

        let enhanced = `${prefix}${roleRaw}`;
        if (name) enhanced += ` "${name}"`;
        enhanced += ` [ref=${ref}]`;
        if (nth > 0) enhanced += ` [nth=${nth}]`;
        if (suffix) enhanced += suffix;
        result.push(enhanced);
    }

    // Remove nth from non-duplicates
    const duplicateKeys = new Set<string>();
    for (const [key, list] of refsByKey) {
        if (list.length > 1) duplicateKeys.add(key);
    }
    for (const [ref, data] of Object.entries(refs)) {
        const key = `${data.role}:${data.name ?? ''}`;
        if (!duplicateKeys.has(key)) {
            delete (refs[ref] as { nth?: number }).nth;
        }
    }

    return { snapshot: result.join('\n') || '(empty)', refs };
}
