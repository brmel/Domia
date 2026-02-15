import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { TemporalPromptAssemblerService } from './TemporalPromptAssemblerService';

describe('TemporalPromptAssemblerService', () => {
    it('assembles a bounded prompt window with token estimate', () => {
        const assembler = new TemporalPromptAssemblerService();
        const window = assembler.assemble({
            runId: 'run-1',
            mode: 'adaptive',
            frames: [
                { timestamp: 10, intervalMs: 80, domHash: 'one', note: 'a' },
                { timestamp: 20, intervalMs: 80, domHash: 'two', note: 'b' },
                { timestamp: 30, intervalMs: 80, domHash: 'three', note: 'c' }
            ],
            maxFramesPerWindow: 2,
            droppedFrameCount: 1,
            redactionApplied: true,
            tokenBudget: 100
        });

        expect(window.frames.length).toBeLessThanOrEqual(2);
        expect(window.mode).toBe('adaptive');
        expect(window.tokenEstimate).toBeGreaterThan(0);
        expect(window.redactionApplied).toBe(true);
    });
});
