import type { AgentAction } from '@domain/value-objects';
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

export type AgentRunnerEvent =
    | {
          readonly type: 'action';
          readonly action: AgentAction;
          readonly actionIndex: number;
          readonly trace: Partial<StepTrace>;
      }
    | {
          readonly type: 'thinking_chunk';
          readonly text: string;
      };

export interface StepRunnerConfig {
    readonly runId: string;
    readonly stepGoal: string;
    readonly url: string;
    readonly maxActions: number;
    readonly vision: boolean;
    readonly platform?: import('../types/PlatformConfig').PlatformType | undefined;
}

export interface IAgentRunner {
    executeStep(
        config: StepRunnerConfig,
        automation: import('./IAppAutomation').IStructuredAutomation,
    ): AsyncGenerator<AgentRunnerEvent, StepExecutionResult, unknown>;
}
