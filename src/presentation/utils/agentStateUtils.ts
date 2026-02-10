import { AgentStatus } from '../../domain/types/AgentStatus';

/**
 * Determines if the user can interact with the UI (e.g. change settings, view history)
 * Interaction is disabled when the agent is running or paused (active session).
 */
export const canInteract = (status: AgentStatus): boolean => {
    return status === AgentStatus.IDLE || status === AgentStatus.COMPLETED || status === AgentStatus.FAILED || status === AgentStatus.CANCELLED;
};

export const isAgentRunning = (status: AgentStatus): boolean => {
    return status === AgentStatus.RUNNING || status === AgentStatus.PAUSED;
};

export const canStart = (status: AgentStatus): boolean => {
    return status === AgentStatus.IDLE || status === AgentStatus.COMPLETED || status === AgentStatus.FAILED || status === AgentStatus.CANCELLED;
};

export const canPause = (status: AgentStatus): boolean => {
    return status === AgentStatus.RUNNING;
};

export const canResume = (status: AgentStatus): boolean => {
    return status === AgentStatus.PAUSED;
};

export const canStop = (status: AgentStatus): boolean => {
    return status === AgentStatus.RUNNING || status === AgentStatus.PAUSED;
};
