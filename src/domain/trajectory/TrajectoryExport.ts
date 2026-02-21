import type { AgentAction } from '@domain/value-objects';

export interface TrajectoryFilter {
    readonly runIds?: readonly string[];
    readonly workflowDefinitionId?: string;
    readonly from?: string;
    readonly to?: string;
    readonly includeChosenRejected?: boolean;
}

export interface TrajectoryStepRecord {
    readonly runId: string;
    readonly stepNumber: number;
    readonly contextSnapshot: {
        readonly goal: string;
        readonly currentUrl: string;
        readonly promptPreview?: string;
    };
    readonly modelProposal?: AgentAction;
    readonly operatorCorrection?: AgentAction;
    readonly finalExecutedAction: AgentAction;
    readonly evaluatorOutcome?: {
        readonly decision: string;
        readonly summary: string;
        readonly advice?: string;
    };
}

export interface TrajectoryExportBundle {
    readonly generatedAt: string;
    readonly filters: TrajectoryFilter;
    readonly trajectories: readonly TrajectoryStepRecord[];
}

export interface TrajectoryExportResult {
    readonly filePath: string;
    readonly exportedCount: number;
}
