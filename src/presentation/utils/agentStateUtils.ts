import { AgentStatus } from '../../domain/types/AgentStatus';

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
