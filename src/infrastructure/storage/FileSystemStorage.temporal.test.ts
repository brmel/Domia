import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { FileSystemStorage } from './FileSystemStorage';

describe('FileSystemStorage temporal window (high-level)', () => {
    it('persists and reloads temporal window artifacts', async () => {
        const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-temporal-'));
        const storage = new FileSystemStorage({
            get: () => ({
                paths: {
                    artifactsDir
                }
            })
        } as any);

        const runId = 'run-temporal';
        const stepNumber = 2;

        await storage.saveTemporalWindow(runId, stepNumber, {
            runId,
            fromTimestamp: 1000,
            toTimestamp: 1400,
            summary: 'Temporal adaptive window with 2 frame(s), dropped 1, estimated 42 tokens',
            mode: 'adaptive',
            selectedFrameCount: 2,
            droppedFrameCount: 1,
            tokenEstimate: 42,
            redactionApplied: true,
            frames: [
                { timestamp: 1200, intervalMs: 200, domHash: 'abcdef12…', note: 'a' },
                { timestamp: 1400, intervalMs: 200, domHash: 'fedcba21…', note: 'b' }
            ]
        });

        const artifacts = await storage.getStepArtifacts(runId, stepNumber);

        expect(artifacts.temporalWindow).toBeDefined();
        expect(artifacts.temporalWindow?.mode).toBe('adaptive');
        expect(artifacts.temporalWindow?.frames.length).toBe(2);

        await fs.remove(artifactsDir);
    });
});
