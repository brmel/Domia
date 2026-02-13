import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { TemporalContextSelectorService } from './TemporalContextSelectorService';
import { TemporalPrivacyFilterService } from './TemporalPrivacyFilterService';
import { TemporalPromptAssemblerService } from './TemporalPromptAssemblerService';

describe('Temporal context pipeline (high-level)', () => {
    it('selects, redacts, and assembles timeline context within budget', () => {
        const selector = new TemporalContextSelectorService();
        const privacy = new TemporalPrivacyFilterService();
        const assembler = new TemporalPromptAssemblerService();

        const sourceFrames = [
            { timestamp: 1000, intervalMs: 90, domHash: 'frame-00000001', note: 'user email test@demo.com' },
            { timestamp: 1120, intervalMs: 120, domHash: 'frame-00000002', note: 'stable state' },
            { timestamp: 1250, intervalMs: 130, domHash: 'frame-00000003', note: 'account 123456789' },
            { timestamp: 1390, intervalMs: 140, domHash: 'frame-00000004', note: 'cta moved' }
        ];

        const selected = selector.select(sourceFrames, { maxFrames: 3 });
        const redacted = privacy.redact(selected.frames, { enabled: true });
        const window = assembler.assemble({
            runId: 'run-pipeline',
            mode: 'adaptive',
            frames: redacted.frames,
            maxFramesPerWindow: 3,
            droppedFrameCount: selected.droppedFrameCount,
            redactionApplied: redacted.redactionApplied,
            tokenBudget: 120
        });

        expect(window.frames.length).toBeLessThanOrEqual(3);
        expect(window.summary).toContain('Temporal adaptive window');
        expect(window.tokenEstimate).toBeGreaterThan(0);
        expect(window.redactionApplied).toBe(true);
        expect(window.frames.some(frame => (frame.domHash ?? '').endsWith('…'))).toBe(true);
    });
});
