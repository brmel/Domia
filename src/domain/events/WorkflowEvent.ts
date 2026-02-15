export type WorkflowEvent =
    | {
        readonly type: 'workflow_started';
        readonly workflowRunId: string;
        readonly workflowDefinitionId: string;
    }
    | {
        readonly type: 'workflow_step_started';
        readonly workflowRunId: string;
        readonly stepId: string;
        readonly stepIndex: number;
    }
    | {
        readonly type: 'workflow_step_bound';
        readonly workflowRunId: string;
        readonly stepId: string;
        readonly stepIndex: number;
        readonly testRunId: string;
    }
    | {
        readonly type: 'workflow_step_completed';
        readonly workflowRunId: string;
        readonly stepId: string;
        readonly stepIndex: number;
        readonly success: boolean;
        readonly summary?: string;
    }
    | {
        readonly type: 'workflow_completed';
        readonly workflowRunId: string;
        readonly success: boolean;
        readonly summary?: string;
    }
    | {
        readonly type: 'workflow_failed';
        readonly workflowRunId: string;
        readonly reason: string;
    };
