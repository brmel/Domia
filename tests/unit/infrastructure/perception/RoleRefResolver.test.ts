import { describe, it, expect } from 'vitest';
import { buildRoleSnapshot } from '@infrastructure/perception/RoleRefResolver';

describe('buildRoleSnapshot', () => {
    it('assigns refs to interactive roles', () => {
        const aria = [
            '- main:',
            '  - button "Submit"',
            '  - textbox "Email"',
        ].join('\n');

        const { refs, snapshot } = buildRoleSnapshot(aria);
        const refKeys = Object.keys(refs);
        expect(refKeys).toHaveLength(2);
        expect(refs['e1']).toMatchObject({ role: 'button', name: 'Submit' });
        expect(refs['e2']).toMatchObject({ role: 'textbox', name: 'Email' });
        expect(snapshot).toContain('[ref=e1]');
        expect(snapshot).toContain('[ref=e2]');
    });

    it('assigns refs to content roles with names (space format)', () => {
        const aria = [
            '- main:',
            '  - heading "Welcome" [level=1]',
            '  - cell "Price"',
        ].join('\n');

        const { refs } = buildRoleSnapshot(aria);
        expect(Object.keys(refs)).toHaveLength(2);
        expect(refs['e1']).toMatchObject({ role: 'heading', name: 'Welcome' });
        expect(refs['e2']).toMatchObject({ role: 'cell', name: 'Price' });
    });

    it('assigns refs to content roles with colon format (Playwright)', () => {
        const aria = [
            '- list "Numbers":',
            '  - listitem: "1"',
            '  - listitem: "2"',
            '  - listitem: "3"',
        ].join('\n');

        const { refs, snapshot } = buildRoleSnapshot(aria);
        const refKeys = Object.keys(refs);
        expect(refKeys).toHaveLength(3);
        expect(refs['e1']).toMatchObject({ role: 'listitem', name: '1' });
        expect(refs['e2']).toMatchObject({ role: 'listitem', name: '2' });
        expect(refs['e3']).toMatchObject({ role: 'listitem', name: '3' });
        expect(snapshot).toContain('listitem "1" [ref=e1]');
        expect(snapshot).toContain('listitem "2" [ref=e2]');
        expect(snapshot).toContain('listitem "3" [ref=e3]');
    });

    it('unwraps single-quoted YAML lines from Playwright', () => {
        const aria = [
            '- main:',
            '  - \'heading "Page: Home" [level=1]\'',
        ].join('\n');

        const { refs, snapshot } = buildRoleSnapshot(aria);
        expect(Object.keys(refs)).toHaveLength(1);
        expect(refs['e1']).toMatchObject({ role: 'heading', name: 'Page: Home' });
        expect(snapshot).toContain('[ref=e1]');
    });

    it('skips content roles without a name', () => {
        const aria = [
            '- main:',
            '  - listitem',
            '  - region',
        ].join('\n');

        const { refs } = buildRoleSnapshot(aria);
        expect(Object.keys(refs)).toHaveLength(0);
    });

    it('tracks nth for duplicate role:name pairs', () => {
        const aria = [
            '- list "Items":',
            '  - listitem: "apple"',
            '  - listitem: "apple"',
            '  - listitem: "banana"',
        ].join('\n');

        const { refs } = buildRoleSnapshot(aria);
        expect(refs['e1']).toMatchObject({ role: 'listitem', name: 'apple', nth: 0 });
        expect(refs['e2']).toMatchObject({ role: 'listitem', name: 'apple', nth: 1 });
        // banana is unique, nth removed
        expect(refs['e3']).toMatchObject({ role: 'listitem', name: 'banana' });
        expect(refs['e3']).not.toHaveProperty('nth');
    });

    it('respects maxDepth', () => {
        const aria = [
            '- main:',
            '  - list "Items":',
            '    - listitem: "deep"',
        ].join('\n');

        const { refs } = buildRoleSnapshot(aria, 1);
        // listitem is at depth 2 — filtered out
        expect(Object.keys(refs)).toHaveLength(0);
    });

    it('handles a realistic fast-counter ARIA snapshot', () => {
        const aria = [
            '- main:',
            '  - \'heading "Fast Counter: 1 to 100" [level=1]\'',
            '  - paragraph: All numbers appear almost instantly.',
            '  - text: "Status: Complete (100 numbers displayed)"',
            '  - list "Displayed numbers":',
            '    - listitem: "1"',
            '    - listitem: "2"',
            '    - listitem: "36"',
            '    - listitem: "38"',
            '    - listitem: "99"',
            '    - listitem: "100"',
        ].join('\n');

        const { refs, snapshot } = buildRoleSnapshot(aria);
        const refKeys = Object.keys(refs);

        // heading + 6 listitems = 7 refs
        expect(refKeys).toHaveLength(7);

        // Heading is parsed from the single-quoted format
        expect(refs['e1']).toMatchObject({ role: 'heading', name: 'Fast Counter: 1 to 100' });

        // All listitems got refs
        expect(refs['e2']).toMatchObject({ role: 'listitem', name: '1' });
        expect(refs['e7']).toMatchObject({ role: 'listitem', name: '100' });

        // Snapshot has ref annotations
        expect(snapshot).toContain('[ref=e1]');
        expect(snapshot).toContain('[ref=e2]');
    });
});
