import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { TemporalContextSelectorService } from './TemporalContextSelectorService';

describe('TemporalContextSelectorService', () => {
    it('keeps latest frame and enforces max bounds', () => {
        const selector = new TemporalContextSelectorService();
        const frames = [
            { timestamp: 1, intervalMs: 100, domHash: 'a' },
            { timestamp: 2, intervalMs: 100, domHash: 'b' },
            { timestamp: 3, intervalMs: 100, domHash: 'c' },
            { timestamp: 4, intervalMs: 100, domHash: 'd' }
        ];

        const result = selector.select(frames, { maxFrames: 2 });

        expect(result.frames.length).toBe(2);
        expect(result.frames.at(-1)?.timestamp).toBe(4);
        expect(result.droppedFrameCount).toBe(2);
    });
});
