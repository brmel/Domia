import type { RunId } from '../value-objects/Brand';
import type { AgentAction } from '../value-objects/AgentAction';
import type { WorkflowState } from '../value-objects/WorkflowState';
import type { AgentOutcome } from '../ports/IAgentRuntime';

export interface DomainEvents {
    'run.started': { runId: RunId; url: string; prompt: string };
    'run.completed': { runId: RunId; success: boolean; summary: string };
    'run.failed': { runId: RunId; error: string };
    'run.cancelled': { runId: RunId };
    'run.state_updated': { runId: RunId; state: WorkflowState };
    'step.persisted': { runId: RunId; stepNumber: number; action: AgentAction };
    'agent.outcome': { runId: RunId; outcome: AgentOutcome };
    'plugin.loaded': { name: string; toolCount: number };
    'config.changed': { keys: readonly string[] };
}

export type DomainEventName = keyof DomainEvents;
