import { describe, expect, it } from 'vitest';
import { HtmlReportGenerator } from '@infrastructure/reporting/HtmlReportGenerator';
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

describe('HtmlReportGenerator', () => {
    const generator = new HtmlReportGenerator();

    it('has format "html"', () => {
        expect(generator.format).toBe('html');
    });

    it('generates valid HTML document', () => {
        const html = generator.generate(makeReport());
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html');
        expect(html).toContain('</html>');
        expect(html).toContain('Domia Run Report');
    });

    it('includes run metadata', () => {
        const html = generator.generate(makeReport());
        expect(html).toContain('run-1');
        expect(html).toContain('https://example.com');
        expect(html).toContain('Test goal');
    });

    it('shows passed status with green color', () => {
        const html = generator.generate(makeReport());
        expect(html).toContain('#22c55e');
        expect(html).toContain('passed');
        expect(html).toContain('All good');
    });

    it('shows failed status with red color and error message', () => {
        const html = generator.generate(makeReport({ status: { type: 'failed', error: 'Kaboom', duration: 2000 } }));
        expect(html).toContain('#ef4444');
        expect(html).toContain('failed');
        expect(html).toContain('Kaboom');
    });

    it('renders step rows in table', () => {
        const steps: RunReport['steps'] = [
            { id: 's1', runId: 'run-1', stepNumber: 1, actionType: ActionType.CLICK, actionPayload: { type: 'click' } as never, timestamp: '2024-01-01T00:00:00Z' },
        ];
        const html = generator.generate(makeReport(undefined, steps));
        expect(html).toContain('<table>');
        expect(html).toContain('click');
        expect(html).toContain('Steps (1)');
    });

    it('shows empty message when there are no steps', () => {
        const html = generator.generate(makeReport());
        expect(html).toContain('No steps recorded.');
    });

    it('escapes HTML special characters', () => {
        const html = generator.generate(makeReport({ prompt: 'Test <script>alert("xss")</script>' }));
        expect(html).toContain('Test &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert');
    });
});
