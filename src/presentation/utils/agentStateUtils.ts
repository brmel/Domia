import { TestRunState } from '@domain/enums/TestRunState';

export const canInteract = (status: TestRunState): boolean => {
    return status === TestRunState.IDLE || status === TestRunState.COMPLETED || status === TestRunState.FAILED || status === TestRunState.CANCELLED;
};

export const isAgentRunning = (status: TestRunState): boolean => {
    return status === TestRunState.RUNNING || status === TestRunState.PAUSED;
};

export const canStart = (status: TestRunState): boolean => {
    return status === TestRunState.IDLE || status === TestRunState.COMPLETED || status === TestRunState.FAILED || status === TestRunState.CANCELLED;
};

export const canPause = (status: TestRunState): boolean => {
    return status === TestRunState.RUNNING;
};

export const canResume = (status: TestRunState): boolean => {
    return status === TestRunState.PAUSED;
};

export const canStop = (status: TestRunState): boolean => {
    return status === TestRunState.RUNNING || status === TestRunState.PAUSED;
};
