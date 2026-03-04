import { RunState } from '@domain/enums/RunState';

export const isAgentRunning = (status: RunState): boolean => {
    return status === RunState.RUNNING || status === RunState.PAUSED;
};

export const canStart = (status: RunState): boolean => {
    return status === RunState.IDLE || status === RunState.COMPLETED || status === RunState.FAILED || status === RunState.CANCELLED;
};

export const canPause = (status: RunState): boolean => {
    return status === RunState.RUNNING;
};

export const canResume = (status: RunState): boolean => {
    return status === RunState.PAUSED;
};

export const canStop = (status: RunState): boolean => {
    return status === RunState.RUNNING || status === RunState.PAUSED;
};
