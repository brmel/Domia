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

    it('prunes older temporal windows beyond retention count', async () => {
        const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-temporal-prune-'));
        const storage = new FileSystemStorage({
            get: () => ({
                paths: {
                    artifactsDir
                },
                limits: {
                    temporalWindowRetentionCount: 2
                }
            })
        } as any);

        const runId = 'run-temporal-prune';

        for (const stepNumber of [1, 2, 3]) {
            await storage.saveTemporalWindow(runId, stepNumber, {
                runId,
                fromTimestamp: 1000,
                toTimestamp: 1400,
                summary: `window-${stepNumber}`,
                mode: 'adaptive',
                selectedFrameCount: 1,
                droppedFrameCount: 0,
                tokenEstimate: 10,
                redactionApplied: false,
                frames: [{ timestamp: 1400, intervalMs: 200, domHash: `hash-${stepNumber}`, note: 'frame' }]
            });
        }

        const stepsDir = path.join(artifactsDir, runId, 'steps');
        const files = await fs.readdir(stepsDir);

        expect(files).not.toContain('1_timeline.json');
        expect(files).toContain('2_timeline.json');
        expect(files).toContain('3_timeline.json');

        await fs.remove(artifactsDir);
    });

    it('evicts oldest temporal windows when run byte budget is exceeded', async () => {
        const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-temporal-budget-'));
        const storage = new FileSystemStorage({
            get: () => ({
                paths: {
                    artifactsDir
                },
                limits: {
                    temporalWindowRetentionCount: 10,
                    temporalWindowMaxBytesPerRun: 800
                }
            })
        } as any);

        const runId = 'run-temporal-budget';
        const largeNote = 'x'.repeat(420);

        for (const stepNumber of [1, 2, 3]) {
            await storage.saveTemporalWindow(runId, stepNumber, {
                runId,
                fromTimestamp: 1000,
                toTimestamp: 1400,
                summary: `window-${stepNumber}`,
                mode: 'adaptive',
                selectedFrameCount: 1,
                droppedFrameCount: 0,
                tokenEstimate: 10,
                redactionApplied: false,
                frames: [{ timestamp: 1400, intervalMs: 200, domHash: `hash-${stepNumber}`, note: largeNote }]
            });
        }

        const stepsDir = path.join(artifactsDir, runId, 'steps');
        const files = (await fs.readdir(stepsDir)).filter((file) => file.endsWith('_timeline.json'));

        expect(files.length).toBeGreaterThan(0);
        expect(files).toContain('3_timeline.json');
        expect(files).not.toContain('1_timeline.json');

        const totalSize = (await Promise.all(files.map(async (file) => (await fs.stat(path.join(stepsDir, file))).size)))
            .reduce((sum, size) => sum + size, 0);

        expect(totalSize).toBeLessThanOrEqual(800);

        await fs.remove(artifactsDir);
    });
});
