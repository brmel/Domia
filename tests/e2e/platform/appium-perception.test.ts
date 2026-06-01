import { describe, expect, it } from 'vitest';
import { parseAccessibilityTree } from '@infrastructure/appium/AppiumPerceptionSource';

describe('Appium accessibility-tree parsing (W7)', () => {
    it('extracts named + text-bearing Android elements with stable refs', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node class="android.widget.Button" content-desc="Submit" text="Submit" clickable="true"/>
  <node class="android.widget.TextView" text="Welcome back"/>
  <node class="android.widget.FrameLayout"/>
</hierarchy>`;

        const { lines, refs } = parseAccessibilityTree(xml);

        // The empty FrameLayout (no name, no text) is dropped; the other two are kept.
        expect(lines).toHaveLength(2);
        expect(refs['e1']).toEqual({ role: 'android.widget.Button', name: 'Submit' });
        expect(refs['e2']).toEqual({ role: 'android.widget.TextView' });
        expect(lines[0]).toContain('[ref=e1]');
        expect(lines[1]).toContain('Welcome back');
    });

    it('uses iOS name/label attributes', () => {
        const xml = `<XCUIElementTypeApplication name="MyApp">
  <XCUIElementTypeButton name="Login" label="Log in" enabled="true"/>
</XCUIElementTypeApplication>`;

        const { refs } = parseAccessibilityTree(xml);
        const loginRef = Object.values(refs).find((r) => r.name === 'Login');
        expect(loginRef).toBeDefined();
        expect(loginRef?.role).toBe('XCUIElementTypeButton');
    });

    it('reports an empty screen clearly', () => {
        const { lines, refs } = parseAccessibilityTree('<hierarchy></hierarchy>');
        expect(Object.keys(refs)).toHaveLength(0);
        expect(lines[0]).toContain('no named or text-bearing elements');
    });
});
