import 'reflect-metadata';
import { describe, expect, it, beforeEach } from 'vitest';
import { ExecutionController } from '@backend/ExecutionController';
import { RunControlGateService } from '@backend/runs/RunControlGateService';
import { RunDurabilityService } from '@backend/runs/RunDurabilityService';
import { SQLiteCheckpointRepository } from '@infrastructure/persistence/SQLiteCheckpointRepository';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { RunId } from '@domain/value-objects';
import { createTerminalTools } from '@infrastructure/tools/catalog/terminal.tools';
import { ActionType } from '@domain/enums';
import { createInMemoryDb } from '../../support/tempDb';

describe('Suspend control gate + suspend tool', () => {
    let controller: ExecutionController;
    let gate: RunControlGateService;

    beforeEach(async () => {
        const { db } = await createInMemoryDb();
        const repo = new SQLiteCheckpointRepository(db);
        const durability = new RunDurabilityService(repo, new ConsoleLogger());
        gate = new RunControlGateService(durability);
        controller = new ExecutionController();
        controller.start();
    });

    it('controller carries a pending suspend request until consumed', () => {
        expect(controller.hasPendingSuspendRequest()).toBe(false);
        controller.requestSuspend('agent decided');
        expect(controller.hasPendingSuspendRequest()).toBe(true);
        const consumed = controller.consumeSuspendRequest();
        expect(consumed).toEqual({ reason: 'agent decided' });
        expect(controller.hasPendingSuspendRequest()).toBe(false);
        expect(controller.consumeSuspendRequest()).toBeNull();
    });

    it('gate returns suspended decision when controller has a pending request', async () => {
        controller.requestSuspend('long wait');
        const decision = await gate.evaluate('r1' as RunId, WorkflowState.initial(), controller);
        expect(decision.kind).toBe('suspended');
        if (decision.kind === 'suspended') {
            expect(decision.reason).toBe('long wait');
        }
    });

    it('gate prefers cancelled over suspended when both signal', async () => {
        controller.requestSuspend('want suspend');
        controller.stop();
        const decision = await gate.evaluate('r2' as RunId, WorkflowState.initial(), controller);
        expect(decision.kind).toBe('cancelled');
    });

    it('suspend tool fires the callback with the reason and returns success', async () => {
        let captured: string | null = null;
        const tools = createTerminalTools((reason) => { captured = reason; });
        const suspend = tools.find((t) => t.name === 'suspend');
        expect(suspend).toBeDefined();
        expect(suspend!.actionType).toBe(ActionType.SUSPEND);

        const result = await suspend!.execute({ reason: 'awaiting batch job completion' }) as { status: string; reason: string };
        expect(result.status).toBe('suspended');
        expect(result.reason).toBe('awaiting batch job completion');
        expect(captured).toBe('awaiting batch job completion');
    });

    it('suspend tool errors when no callback is wired', async () => {
        const tools = createTerminalTools();
        const suspend = tools.find((t) => t.name === 'suspend');
        const result = await suspend!.execute({ reason: 'whatever' }) as { status: string; error?: string };
        expect(result.status).toBe('error');
        expect(result.error).toMatch(/not wired/);
    });
});
