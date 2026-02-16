import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowStepRunnerService } from './WorkflowStepRunnerService';

describe('WorkflowStepRunnerService', () => {
    it('passes shared session context to RunTestUseCase when provided', async () => {
        const execute = vi.fn(async function* () {
            yield { type: 'started', testRunId: 'run-1' as const };
            yield { type: 'completed', success: true, summary: 'ok' as const };
        });

        const service = new WorkflowStepRunnerService(
            { execute } as any,
            { createSession: vi.fn() } as any
        );

        const sharedSession = {
            executionUrl: 'https://example.com',
            shouldNavigate: true,
            browser: {},
            dispose: vi.fn(async () => undefined)
        };

        const result = await service.runStep(
            {
                id: 'step-1',
                name: 'Step 1',
                prompt: 'do work',
                continueOnFailure: false
            },
            0,
            {
                id: 'wf-1',
                name: 'Workflow 1',
                status: 'draft',
                version: 1,
                platformConfig: { platform: 'web', url: 'https://example.com' },
                steps: [],
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z'
            },
            { state: 'running' } as any,
            {
                session: sharedSession as any,
                shouldNavigate: false
            }
        );

        expect(result.success).toBe(true);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledWith(
            {
                platformConfig: { platform: 'web', url: 'https://example.com' },
                prompt: 'do work'
            },
            expect.anything(),
            {
                session: sharedSession,
                shouldNavigate: false,
                disposeSessionOnComplete: false
            }
        );
    });

    it('opens shared session through PlatformSessionFactory', async () => {
        const createSession = vi.fn(async () => ({
            executionUrl: 'https://example.com',
            shouldNavigate: true,
            browser: {},
            dispose: vi.fn(async () => undefined)
        }));

        const service = new WorkflowStepRunnerService(
            { execute: vi.fn() } as any,
            { createSession } as any
        );

        const session = await service.openSharedSession({
            id: 'wf-1',
            name: 'Workflow 1',
            status: 'draft',
            version: 1,
            platformConfig: { platform: 'web', url: 'https://example.com' },
            steps: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
        });

        expect(session.executionUrl).toBe('https://example.com');
        expect(createSession).toHaveBeenCalledTimes(1);
        expect(createSession).toHaveBeenCalledWith({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'Workflow 1',
            options: undefined
        });
    });
});
