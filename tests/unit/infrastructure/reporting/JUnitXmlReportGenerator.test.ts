import { describe, expect, it } from 'vitest';
import { JUnitXmlReportGenerator } from '@infrastructure/reporting/JUnitXmlReportGenerator';
import type { RunReport } from '@domain/ports/IReportGenerator';
import { ActionType } from '@domain/enums';
import type { RunId, Url } from '@domain/value-objects/Brand';

function makeReport(overrides?: Partial<RunReport['run']>, steps?: RunReport['steps']): RunReport {
    return {
        run: {
            id: 'run-1' as RunId,
            url: 'https://example.com' as Url,
            prompt: 'Test goal',
            status: { type: 'passed', summary: 'All good', duration: 5000 },
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            ...overrides,
        },
        steps: steps ?? [],
    };
}

describe('JUnitXmlReportGenerator', () => {
    const generator = new JUnitXmlReportGenerator();

    it('has format "junit"', () => {
        expect(generator.format).toBe('junit');
    });

    it('generates valid XML for a passed run with no steps', () => {
        const xml = generator.generate(makeReport());
        expect(xml).toContain('<?xml version="1.0"');
        expect(xml).toContain('<testsuites');
        expect(xml).toContain('failures="0"');
        expect(xml).toMatch(/time="5/);
        expect(xml).not.toContain('<failure');
    });

    it('generates failure element for failed run', () => {
        const xml = generator.generate(makeReport({ status: { type: 'failed', error: 'Boom', duration: 3000 } }));
        expect(xml).toContain('failures="1"');
        expect(xml).toContain('<failure message="Boom"');
    });

    it('generates testcases for steps', () => {
        const steps: RunReport['steps'] = [
            { id: 's1', runId: 'run-1', stepNumber: 1, actionType: ActionType.CLICK, actionPayload: { type: 'click' } as never, timestamp: '2024-01-01' },
            { id: 's2', runId: 'run-1', stepNumber: 2, actionType: ActionType.TYPE, actionPayload: { type: 'type' } as never, timestamp: '2024-01-01' },
        ];
        const xml = generator.generate(makeReport(undefined, steps));
        expect(xml).toContain('Step 1: click');
        expect(xml).toContain('Step 2: type');
        expect(xml).toContain('tests="2"');
    });

    it('escapes XML special characters', () => {
        const xml = generator.generate(makeReport({ prompt: 'Test <goal> & "more"' }));
        expect(xml).toContain('&lt;goal');
        expect(xml).toContain('&amp;');
        expect(xml).toContain('&quot;more&quot;');
    });
});
