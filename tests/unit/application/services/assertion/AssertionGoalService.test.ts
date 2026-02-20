import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AssertionGoalService } from '@application/services/assertion/AssertionGoalService';
import type { DOMSnapshot } from '@domain/value-objects/DOMSnapshot';
import { ActionType } from '@domain/enums/ActionType';
import { ElementIdFactory } from '@domain/value-objects';

function buildSnapshot(texts: string[]): DOMSnapshot {
    return {
        url: 'https://ibraverse.ca',
        title: 'Ibraverse',
        rootElements: { html: { lang: 'en' }, body: {} },
        elements: texts.map((text, index) => ({
            id: ElementIdFactory.unsafe(index),
            tag: 'a',
            role: null,
            text,
            attributes: {},
            isInteractive: true,
            boundingBox: null,
        })),
        timestamp: new Date(),
        accessibilityTree: null,
    };
}

describe('AssertionGoalService language validation', () => {
    it('passes when required language labels are visibly present with abbreviations/native script', () => {
        const service = new AssertionGoalService();
        const snapshot = buildSnapshot(['Ibraverse', 'Fr', 'En', 'عربى']);

        const result = service.evaluate(
            'Open the website language bar and validate Arabic, English, and French labels',
            snapshot
        );

        expect(result).toBeDefined();
        expect(result?.type).toBe(ActionType.PASS);
        if (!result || result.type !== ActionType.PASS) {
            throw new Error('Expected PASS action');
        }

        expect(result.summary).toContain('arabic');
        expect(result.summary).toContain('english');
        expect(result.summary).toContain('french');
    });

    it('does not pass when one required language label is missing', () => {
        const service = new AssertionGoalService();
        const snapshot = buildSnapshot(['Ibraverse', 'Fr', 'En']);

        const result = service.evaluate(
            'Open the website language bar and validate Arabic, English, and French labels',
            snapshot
        );

        expect(result).toBeNull();
    });
});
