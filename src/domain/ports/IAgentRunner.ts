import type { AgentAction } from '@domain/value-objects';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { StepTrace } from './ITraceService';

export type StepExecutionResult =
    | { readonly success: true; readonly terminal: 'pass' }
    | {
          readonly success: false;
          readonly terminal: 'fail' | 'error' | 'max_actions';
          readonly code:
              | 'assertion_fail'
              | 'perception_error'
              | 'llm_error'
              | 'loop_detected'
              | 'action_execution_error'
              | 'agent_fail'
              | 'max_actions_reached';
          readonly reason: string;
      };

export interface AgentRunnerEvent {
    readonly type: 'action';
    readonly action: AgentAction;
    readonly actionIndex: number;
    readonly trace: Partial<StepTrace>;
    readonly capturedFrame?: PerceptionFrame | undefined;
}

export interface AgentActionEvent {
    readonly type: 'action';
    readonly action: AgentAction;
    readonly assets?: Record<string, string> | undefined;
}

export interface StepRunnerConfig {
    readonly runId: string;
    readonly stepGoal: string;
    readonly url: string;
    readonly maxActions: number;
    readonly vision: boolean;
}

export interface IAgentRunner {
    executeStep(
        config: StepRunnerConfig,
        browser: import('./IAppAutomation').IAppAutomation,
    ): AsyncGenerator<AgentRunnerEvent, StepExecutionResult, unknown>;
}
