import { initTRPC } from '@trpc/server';
import { EventEmitter } from 'events';
import { ExecutionController } from '../../src/application/controllers/ExecutionController';

export const t = initTRPC.create({ isServer: true });
export const eventEmitter = new EventEmitter();

/** Mutable singleton state for the active test controller. */
export const testControllerState = {
    current: null as ExecutionController | null,
};

/** Mutable singleton state for the active workflow controller. */
export const workflowControllerState = {
    current: null as ExecutionController | null,
    executionToken: 0,
};
