import type { AgentAction } from '@domain/value-objects';
import type { StepTrace } from './ITraceService';
import type { PlatformType } from '../types/PlatformConfig';
import type { IStructuredAutomation } from './IAppAutomation';

type AgentVerdict = 'pass' | 'fail';

interface AgentOutput {
    readonly summary: string;
    readonly value?: unknown;
    readonly verdict?: AgentVerdict;
}

type StopReason = 'cancelled' | 'budget_exhausted' | 'no_progress';

export type AgentOutcome =
    | { readonly kind: 'done'; readonly output: AgentOutput }
    | { readonly kind: 'stopped'; readonly reason: StopReason; readonly summary: string }
    | { readonly kind: 'error'; readonly cause: Error };

export type AgentEvent =
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

export interface AgentInput {
    readonly runId: string;
    readonly stepGoal: string;
    readonly url: string;
    readonly maxActions: number;
    readonly vision: boolean;
    readonly platform?: PlatformType | undefined;
    readonly recording?: {
        readonly enabled: boolean;
        readonly maxDurationMs?: number;
        readonly intervalMs?: number;
    };
    readonly extras?: Readonly<Record<string, unknown>>;
}

export interface IAgentRuntime {
    run(
        input: AgentInput,
        automation: IStructuredAutomation,
    ): AsyncGenerator<AgentEvent, AgentOutcome, unknown>;
}
