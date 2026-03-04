import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { RunState } from '@domain/enums/RunState';

describe('ExecutionController mid-step pause', () => {
    it('waitForResume resolves immediately when already running', async () => {
        const controller = new ExecutionController();
        controller.start();
        expect(controller.state).toBe(RunState.RUNNING);

        // Should resolve instantly, not hang
        await controller.waitForResume();
    });

    it('waitForResume blocks until resume is called', async () => {
        const controller = new ExecutionController();
        controller.start();
        controller.pause();
        expect(controller.state).toBe(RunState.PAUSED);

        let resumed = false;
        const waitPromise = controller.waitForResume().then(() => { resumed = true; });

        // Should not have resolved yet
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(resumed).toBe(false);

        // Now resume
        controller.resume();
        await waitPromise;
        expect(resumed).toBe(true);
        expect(controller.state).toBe(RunState.RUNNING);
    });

    it('waitForResume resolves when stop is called (cancellation)', async () => {
        const controller = new ExecutionController();
        controller.start();
        controller.pause();

        let resolved = false;
        const waitPromise = controller.waitForResume().then(() => { resolved = true; });

        // Stop while paused — should unblock waitForResume
        controller.stop();
        await waitPromise;

        expect(resolved).toBe(true);
        expect(controller.isStopped()).toBe(true);
        expect(controller.state).toBe(RunState.CANCELLED);
    });

    it('isStopped returns true for cancelled, completed, and failed states', () => {
        const controller = new ExecutionController();
        controller.start();

        expect(controller.isStopped()).toBe(false);

        controller.stop();
        expect(controller.isStopped()).toBe(true);
    });

    it('pause has no effect when not running', () => {
        const controller = new ExecutionController();
        // Still IDLE
        controller.pause();
        expect(controller.state).toBe(RunState.IDLE);
    });
});
