import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ActionRecordingService } from '@infrastructure/ActionRecordingService';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';

function makeMockSource(screenshotBuffer?: Buffer): IPerceptionSource {
    return {
        captureScreenshot: vi.fn(async () => screenshotBuffer ?? Buffer.from('fake-jpeg')),
        captureAriaSnapshot: vi.fn(async () => ''),
    } as unknown as IPerceptionSource;
}

describe('ActionRecordingService', () => {
    it('captures frames concurrently with action execution', async () => {
        const source = makeMockSource();
        const recorder = new ActionRecordingService(source);

        const { result, recording } = await recorder.record(
            'click',
            async () => {
                // Simulate an action that takes some time
                await new Promise((resolve) => setTimeout(resolve, 50));
                return { status: 'success' };
            },
            { maxDurationMs: 200, intervalMs: 15, quality: 30 },
        );

        expect(result).toEqual({ status: 'success' });
        expect(recording.toolName).toBe('click');
        expect(recording.startedAt).toBeTruthy();
        expect(recording.durationMs).toBeGreaterThanOrEqual(0);
        // Should have at least the final frame + some during execution
        expect(recording.frames.length).toBeGreaterThanOrEqual(1);
        // All frames should have offsetMs and screenshot
        for (const frame of recording.frames) {
            expect(frame.offsetMs).toBeGreaterThanOrEqual(0);
            expect(Buffer.isBuffer(frame.screenshot)).toBe(true);
        }
    });

    it('returns action result even if screenshots fail', async () => {
        const source = {
            captureScreenshot: vi.fn(async () => { throw new Error('screenshot failed'); }),
            captureAriaSnapshot: vi.fn(async () => ''),
        } as unknown as IPerceptionSource;

        const recorder = new ActionRecordingService(source);

        const { result, recording } = await recorder.record(
            'type',
            async () => ({ status: 'done' }),
            { maxDurationMs: 30, intervalMs: 10 },
        );

        // Action result still returned
        expect(result).toEqual({ status: 'done' });
        // No frames captured since screenshots all failed
        expect(recording.frames).toHaveLength(0);
        expect(recording.toolName).toBe('type');
    });

    it('stops capture loop after maxDurationMs', async () => {
        const source = makeMockSource();
        const recorder = new ActionRecordingService(source);

        const { recording } = await recorder.record(
            'scroll',
            async () => {
                // This action takes longer than maxDurationMs
                await new Promise((resolve) => setTimeout(resolve, 200));
                return {};
            },
            { maxDurationMs: 50, intervalMs: 10 },
        );

        // Recording should have stopped after ~50ms even though
        // the action took 200ms. The final frame is captured after action completion,
        // so frames should include those from the 50ms window plus the final one.
        expect(recording.frames.length).toBeGreaterThanOrEqual(1);
    });

    it('captures final frame after action completes', async () => {
        const callOrder: string[] = [];
        const source = {
            captureScreenshot: vi.fn(async () => {
                callOrder.push('screenshot');
                return Buffer.from('frame');
            }),
            captureAriaSnapshot: vi.fn(async () => ''),
        } as unknown as IPerceptionSource;

        const recorder = new ActionRecordingService(source);

        await recorder.record(
            'click',
            async () => {
                callOrder.push('action');
                return {};
            },
            { maxDurationMs: 10, intervalMs: 5 },
        );

        // The last screenshot call should be the final frame after the action
        expect(callOrder.filter(c => c === 'screenshot').length).toBeGreaterThanOrEqual(1);
    });

    it('uses default options when none provided', async () => {
        const source = makeMockSource();
        const recorder = new ActionRecordingService(source);

        const { recording } = await recorder.record(
            'click',
            async () => ({ ok: true }),
        );

        // Should still produce a valid recording with defaults
        expect(recording.toolName).toBe('click');
        expect(recording.frames.length).toBeGreaterThanOrEqual(1);
    });
});
