export const WorkflowStepKind = {
    Agent: 'agent',
    ForEach: 'foreach',
} as const;
export type WorkflowStepKind = typeof WorkflowStepKind[keyof typeof WorkflowStepKind];
