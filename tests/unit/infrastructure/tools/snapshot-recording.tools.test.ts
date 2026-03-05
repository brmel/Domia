import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
    analyzeLog,
    createSnapshotRecordingTools,
    type LogEntry,
} from '@infrastructure/tools/catalog/snapshot-recording.tools';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import { ActionType } from '@domain/enums/ActionType';

// ──────────────────────── analyzeLog unit tests ────────────────────────

describe('analyzeLog', () => {
    it('returns empty arrays for an empty log', () => {
        const result = analyzeLog([], 0);
        expect(result.status).toBe('success');
        expect(result.totalEntries).toBe(0);
        expect(result.durationMs).toBe(0);
        expect(result.allAddedValues).toEqual([]);
        expect(result.allRemovedValues).toEqual([]);
        expect(result.netPresentValues).toEqual([]);
        expect(result.transientValues).toEqual([]);
        expect(result.onlyRemovedValues).toEqual([]);
        expect(result.timeline).toEqual([]);
    });

    it('classifies values that were only added as netPresent', () => {
        const log: LogEntry[] = [
            { t: 0, a: ['Hello', 'World'], r: [] },
            { t: 100, a: ['Foo'], r: [] },
        ];
        const result = analyzeLog(log, 200);
        expect(result.allAddedValues).toEqual(['Hello', 'World', 'Foo']);
        expect(result.allRemovedValues).toEqual([]);
        expect(result.netPresentValues).toEqual(['Hello', 'World', 'Foo']);
        expect(result.transientValues).toEqual([]);
        expect(result.onlyRemovedValues).toEqual([]);
    });

    it('classifies values added then removed as transient', () => {
        const log: LogEntry[] = [
            { t: 0, a: ['flash'], r: [] },
            { t: 50, a: [], r: ['flash'] },
        ];
        const result = analyzeLog(log, 100);
        expect(result.transientValues).toEqual(['flash']);
        expect(result.netPresentValues).toEqual([]);
    });

    it('classifies values only removed as onlyRemoved', () => {
        const log: LogEntry[] = [
            { t: 0, a: [], r: ['preexisting'] },
        ];
        const result = analyzeLog(log, 50);
        expect(result.onlyRemovedValues).toEqual(['preexisting']);
        expect(result.allAddedValues).toEqual([]);
    });

    it('deduplicates repeated values', () => {
        const log: LogEntry[] = [
            { t: 0, a: ['x', 'x', 'y'], r: ['x'] },
            { t: 10, a: ['x'], r: ['y'] },
        ];
        const result = analyzeLog(log, 20);
        expect(result.allAddedValues).toEqual(['x', 'y']);
        expect(result.allRemovedValues).toEqual(['x', 'y']);
        // Both x and y were added AND removed → transient
        expect(result.transientValues).toEqual(['x', 'y']);
        expect(result.netPresentValues).toEqual([]);
    });

    it('correctly records durationMs and totalEntries', () => {
        const log: LogEntry[] = [
            { t: 0, a: ['a'], r: [] },
            { t: 500, a: ['b'], r: [] },
            { t: 1000, a: ['c'], r: [] },
        ];
        const result = analyzeLog(log, 1234);
        expect(result.durationMs).toBe(1234);
        expect(result.totalEntries).toBe(3);
    });

    it('limits timeline to first 60 entries', () => {
        const log: LogEntry[] = Array.from({ length: 100 }, (_, i) => ({
            t: i * 10,
            a: [String(i)],
            r: [],
        }));
        const result = analyzeLog(log, 1000);
        expect(result.timeline).toHaveLength(60);
        expect(result.timeline[0]!.offsetMs).toBe(0);
        expect(result.timeline[59]!.offsetMs).toBe(590);
    });

    it('handles a realistic fast-counter recording (skip #37)', () => {
        // Simulate counter 1..100 where each number replaces the previous
        // and number 37 is skipped.
        const log: LogEntry[] = [];
        for (let n = 1; n <= 100; n++) {
            if (n === 37) continue;
            const removed = n > 1 && n !== 38 ? [String(n - 1)] : n === 38 ? [String(36)] : [];
            log.push({ t: n, a: [String(n)], r: removed });
        }
        // Final clear — remove the last number
        log.push({ t: 101, a: [], r: ['100'] });

        const result = analyzeLog(log, 101);

        // 37 was never added
        expect(result.allAddedValues).not.toContain('37');
        // All other numbers 1..100 were added
        for (let n = 1; n <= 100; n++) {
            if (n === 37) continue;
            expect(result.allAddedValues).toContain(String(n));
        }
        // All were transient (added then removed by next number or final clear)
        expect(result.transientValues.length).toBeGreaterThan(0);
        // Nothing should be netPresent since grid was cleared
        expect(result.netPresentValues).toEqual([]);
    });
});

// ────────────────── createSnapshotRecordingTools tests ──────────────────

describe('createSnapshotRecordingTools', () => {
    function stubPerceptionSource(): IPerceptionSource {
        return {
            captureScreenshot: vi.fn(),
            captureAriaSnapshot: vi.fn(),
            evaluateScript: vi.fn(),
        } as unknown as IPerceptionSource;
    }

    it('returns two tools: startRecording and stopAndReviewRecording', () => {
        const tools = createSnapshotRecordingTools(stubPerceptionSource());
        expect(tools).toHaveLength(2);
        expect(tools[0]!.name).toBe('startRecording');
        expect(tools[1]!.name).toBe('stopAndReviewRecording');
    });

    it('tools have correct ActionTypes', () => {
        const tools = createSnapshotRecordingTools(stubPerceptionSource());
        expect(tools[0]!.actionType).toBe(ActionType.START_RECORDING);
        expect(tools[1]!.actionType).toBe(ActionType.STOP_AND_REVIEW_RECORDING);
    });

    it('startRecording delegates to evaluateScript', async () => {
        const source = stubPerceptionSource();
        (source.evaluateScript as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'started' });

        const tools = createSnapshotRecordingTools(source);
        const result = await tools[0]!.execute({});
        expect(result).toEqual({ status: 'started' });
        expect(source.evaluateScript).toHaveBeenCalledOnce();
    });

    it('startRecording returns error on script failure', async () => {
        const source = stubPerceptionSource();
        (source.evaluateScript as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('page crashed'));

        const tools = createSnapshotRecordingTools(source);
        const result = await tools[0]!.execute({});
        expect(result).toHaveProperty('status', 'error');
        expect((result as Record<string, unknown>)['error']).toContain('page crashed');
    });

    it('stopAndReviewRecording analyzes the returned log', async () => {
        const source = stubPerceptionSource();
        (source.evaluateScript as ReturnType<typeof vi.fn>).mockResolvedValue({
            status: 'stopped',
            durationMs: 500,
            entryCount: 2,
            log: [
                { t: 0, a: ['Hello'], r: [] },
                { t: 200, a: [], r: ['Hello'] },
            ],
        });

        const tools = createSnapshotRecordingTools(source);
        const result = await tools[1]!.execute({}) as Record<string, unknown>;
        expect(result['status']).toBe('success');
        expect(result['totalEntries']).toBe(2);
        expect(result['transientValues']).toEqual(['Hello']);
        expect(result['netPresentValues']).toEqual([]);
    });

    it('stopAndReviewRecording returns error when no recording is active', async () => {
        const source = stubPerceptionSource();
        (source.evaluateScript as ReturnType<typeof vi.fn>).mockResolvedValue({
            status: 'error',
            error: 'No active recording. Call startRecording first.',
        });

        const tools = createSnapshotRecordingTools(source);
        const result = await tools[1]!.execute({}) as Record<string, unknown>;
        expect(result['status']).toBe('error');
        expect(result['error']).toContain('No active recording');
    });
});
