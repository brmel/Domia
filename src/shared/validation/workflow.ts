import { z } from 'zod';
import { PlatformConfigSchema, RunOptionsSchema } from '../validation';

const WorkflowStepSchema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
    continueOnFailure: z.boolean().default(false),
    options: RunOptionsSchema.optional()
});

export const CreateWorkflowInputSchema = z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    platformConfig: PlatformConfigSchema,
    steps: z.array(WorkflowStepSchema.omit({ id: true })).min(1)
});

export const UpdateWorkflowInputSchema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    platformConfig: PlatformConfigSchema.optional(),
    steps: z.array(WorkflowStepSchema.extend({ id: z.string().trim().min(1).optional() })).min(1)
});

export const PublishWorkflowInputSchema = z.object({
    workflowDefinitionId: z.string().trim().min(1)
});

export const CreateNextWorkflowVersionInputSchema = z.object({
    sourceWorkflowDefinitionId: z.string().trim().min(1)
});

export const StartWorkflowRunInputSchema = z.object({
    workflowDefinitionId: z.string().trim().min(1)
});

export const GetWorkflowRunDetailsInputSchema = z.object({
    workflowRunId: z.string().trim().min(1)
});
