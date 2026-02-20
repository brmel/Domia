import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { TimelineContextAssembler } from '@application/services/perception/TimelineContextAssembler';

describe('TimelineContextAssembler', () => {
    it('keeps only bounded recent frames', () => {
        const assembler = new TimelineContextAssembler();
        const frames = [
            { timestamp: 1, intervalMs: 100 },
            { timestamp: 2, intervalMs: 100 },
            { timestamp: 3, intervalMs: 100 }
        ];

        const window = assembler.assemble('run-1', frames, 2);

        expect(window.frames.length).toBe(2);
        expect(window.fromTimestamp).toBe(2);
        expect(window.toTimestamp).toBe(3);
    });
});
