import { initTRPC } from '@trpc/server';
import { EventEmitter } from 'events';
import { ExecutionController } from '@backend/ExecutionController';

export const t = initTRPC.create({ isServer: true });
export const eventEmitter = new EventEmitter();
eventEmitter.setMaxListeners(50);

export const activeRunState = {
    current: null as ExecutionController | null,
    executionToken: 0,
};

export const workflowControllerState = {
    current: null as ExecutionController | null,
    executionToken: 0,
};
