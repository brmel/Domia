import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ExecutionController } from '@application/ExecutionController';

describe('ExecutionController', () => {
    it('can be instantiated', () => {
        const controller = new ExecutionController();
        expect(controller).toBeInstanceOf(ExecutionController);
    });

    it('is initially not stopped', () => {
        const controller = new ExecutionController();
        expect(controller.isStopped()).toBe(false);
    });

    it('stop() marks it as stopped', () => {
        const controller = new ExecutionController();
        controller.stop();
        expect(controller.isStopped()).toBe(true);
    });
});
