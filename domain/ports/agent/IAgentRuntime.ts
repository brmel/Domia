import type { AgentAction } from '@domain/value-objects';
import type { ArtifactRetention } from '@domain/value-objects/ArtifactRetention';
import type { StepTrace } from '@domain/ports/reporting/ITraceService';
import type { PlatformType } from '../../types/PlatformConfig';
import type { IStructuredAutomation } from '@domain/ports/automation/IAppAutomation';
import type { IObservationCoordinator } from '@domain/ports/perception/IObservationCoordinator';
import type { IWindowManager } from '@domain/ports/automation/IWindowManager';
import type { ITabManager } from '@domain/ports/automation/ITabManager';

export type AgentVerdict = 'pass' | 'fail';

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

/**
 * Out-of-band per-run capabilities handed to the runtime adapter. Replaces the
 * old untyped `Record<string, unknown>` bag so the adapter reads typed fields
 * instead of `as`-casting string keys. Producers: the platform driver
 * (windowManager for electron, tabManager for web) and RunUseCase/
 * RunResumeService (observation, onSuspendRequest).
 */
export interface AgentRuntimeExtras {
    readonly observation?: IObservationCoordinator;
    readonly windowManager?: IWindowManager;
    readonly tabManager?: ITabManager;
    readonly onSuspendRequest?: (reason: string) => void;
}

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
    readonly persistArtifacts?: ArtifactRetention;
    readonly extras?: AgentRuntimeExtras;
}

export interface IAgentRuntime {
    run(
        input: AgentInput,
        automation: IStructuredAutomation,
    ): AsyncGenerator<AgentEvent, AgentOutcome, unknown>;

    snapshotConversation(runId: string): Promise<import('@domain/value-objects/ConversationSnapshot').ConversationSnapshot | null>;

    restoreConversation(runId: string, snapshot: import('@domain/value-objects/ConversationSnapshot').ConversationSnapshot): Promise<void>;
}
