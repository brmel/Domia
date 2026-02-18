import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync, errAsync } from 'neverthrow';
import { StepActionExecutionService } from './StepActionExecutionService';
import { ActionType } from '@domain/enums/ActionType';
import type { AgentAction } from '@domain/value-objects';
import type { ToolExecutor } from '../tooling/ToolExecutor';
import type { IBrowserAutomation } from '@domain/ports';

function createService(executeImpl?: ReturnType<typeof vi.fn>) {
    const execute = executeImpl ?? vi.fn().mockReturnValue(okAsync(undefined));
    const toolExecutor = {
        execute,
    } as unknown as ToolExecutor;

    return {
        service: new StepActionExecutionService(toolExecutor),
        execute,
    };
}

function createBrowser(extractTextImpl?: ReturnType<typeof vi.fn>) {
    return {
        extractText: extractTextImpl ?? vi.fn().mockReturnValue(okAsync('Hello world')),
    } as unknown as IBrowserAutomation;
}

describe('StepActionExecutionService', () => {
    it('returns not_executed for FAIL action with reason', async () => {
        const { service } = createService();
        const browser = createBrowser();
        const action: AgentAction = { type: ActionType.FAIL, reason: 'blocked', thought: 'fail' };

        const result = await service.execute({
            action,
            browser,
            currentUrl: 'https://example.com',
            viewport: { width: 1280, height: 800 },
        });

        expect(result).toEqual({
            outcome: 'not_executed',
            error: 'blocked',
        });
    });

    it('returns normalized observation for EXTRACT action', async () => {
        const { service } = createService();
        const browser = createBrowser(vi.fn().mockReturnValue(okAsync('  hello\n\nworld   ')));
        const action: AgentAction = { type: ActionType.EXTRACT, elementId: 'el_1' as never, thought: 'extract' };

        const result = await service.execute({
            action,
            browser,
            currentUrl: 'https://example.com',
            viewport: { width: 1280, height: 800 },
        });

        expect(result).toEqual({
            outcome: 'executed',
            observation: 'Extracted text: hello world',
        });
    });

    it('fails when pointer action is outside viewport', async () => {
        const { service, execute } = createService();
        const browser = createBrowser();
        const action: AgentAction = { type: ActionType.MOUSE_MOVE, x: 2000, y: 100, thought: 'move' };

        const result = await service.execute({
            action,
            browser,
            currentUrl: 'https://example.com',
            viewport: { width: 1280, height: 800 },
        });

        expect(result.outcome).toBe('execution_error');
        expect(result.error).toContain('Viewport safety check failed');
        expect(execute).not.toHaveBeenCalled();
    });

    it('delegates supported actions to tool executor', async () => {
        const { service, execute } = createService();
        const browser = createBrowser();
        const action: AgentAction = { type: ActionType.WAIT, durationMs: 200, thought: 'wait' };

        const result = await service.execute({
            action,
            browser,
            currentUrl: 'https://example.com',
            viewport: { width: 1280, height: 800 },
        });

        expect(result).toEqual({ outcome: 'executed' });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('maps tool executor error to execution_error outcome', async () => {
        const executionError = new Error('click failed');
        const { service } = createService(vi.fn().mockReturnValue(errAsync(executionError)));
        const browser = createBrowser();
        const action: AgentAction = { type: ActionType.CLICK, elementId: 'el_2' as never, thought: 'click' };

        const result = await service.execute({
            action,
            browser,
            currentUrl: 'https://example.com',
            viewport: { width: 1280, height: 800 },
        });

        expect(result).toEqual({
            outcome: 'execution_error',
            error: 'click failed',
        });
    });
});
