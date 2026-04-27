import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { ObservationRingBuffer } from '@infrastructure/observation/ObservationRingBuffer';
import type { ObservationFrame } from '@domain/value-objects/ObservationFrame';
import type { RunId } from '@domain/value-objects';

function frame(runId: string, capturedAt: number, bytes = 100): ObservationFrame {
    return {
        runId: runId as RunId,
        capturedAt,
        source: 'test',
        summary: `t=${capturedAt}`,
        attachments: [{ id: 'screenshot', contentType: 'image/jpeg', bytes }],
    };
}

describe('ObservationRingBuffer (e2e)', () => {
    it('evicts oldest frames when frame count exceeds limit', () => {
        const buf = new ObservationRingBuffer({ maxFrames: 3, maxBytes: 1_000_000 });
        for (let i = 0; i < 5; i++) buf.push(frame('r1', i, 10));
        const all = buf.snapshot();
        expect(all).toHaveLength(3);
        expect(all.map((f) => f.capturedAt)).toEqual([2, 3, 4]);
    });

    it('evicts oldest frames when total bytes exceed limit', () => {
        const buf = new ObservationRingBuffer({ maxFrames: 100, maxBytes: 250 });
        for (let i = 0; i < 5; i++) buf.push(frame('r1', i, 100));
        expect(buf.snapshot().every((f) => f.attachments[0]!.bytes === 100)).toBe(true);
        expect(buf.size).toBeLessThanOrEqual(2);
    });

    it('returns frames since a relative time window', () => {
        const buf = new ObservationRingBuffer({ maxFrames: 100, maxBytes: 1_000_000 });
        const now = Date.now();
        buf.push(frame('r1', now - 10_000));
        buf.push(frame('r1', now - 5_000));
        buf.push(frame('r1', now - 1_000));
        const recent = buf.sinceMs(2_000, now);
        expect(recent.map((f) => f.capturedAt)).toEqual([now - 1_000]);
    });

    it('clear empties the buffer and resets byte accounting', () => {
        const buf = new ObservationRingBuffer({ maxFrames: 100, maxBytes: 1_000 });
        buf.push(frame('r1', 1, 500));
        buf.push(frame('r1', 2, 500));
        buf.clear();
        expect(buf.size).toBe(0);
        buf.push(frame('r1', 3, 500));
        expect(buf.size).toBe(1);
    });
});
