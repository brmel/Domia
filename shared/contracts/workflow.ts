import { z } from 'zod';
import { PlatformConfigSchema, RunOptionsSchema } from './run';

const AgentStepSchema = z.object({
    kind: z.literal('agent').default('agent'),
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
    continueOnFailure: z.boolean().default(false),
    options: RunOptionsSchema.optional(),
});

const ForEachStepSchema = z.object({
    kind: z.literal('foreach'),
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    items: z.array(z.string().trim().min(1)).min(1),
    bodyPrompt: z.string().trim().min(1),
    continueOnFailure: z.boolean().default(false),
    options: RunOptionsSchema.optional(),
});


const AgentStepCreateSchema = AgentStepSchema.omit({ id: true });
const ForEachStepCreateSchema = ForEachStepSchema.omit({ id: true });
const WorkflowStepCreateSchema = z.discriminatedUnion('kind', [AgentStepCreateSchema, ForEachStepCreateSchema]);

const AgentStepUpdateSchema = AgentStepSchema.extend({ id: z.string().trim().min(1).optional() });
const ForEachStepUpdateSchema = ForEachStepSchema.extend({ id: z.string().trim().min(1).optional() });
const WorkflowStepUpdateSchema = z.discriminatedUnion('kind', [AgentStepUpdateSchema, ForEachStepUpdateSchema]);

export const CreateWorkflowInputSchema = z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    platformConfig: PlatformConfigSchema,
    steps: z.array(WorkflowStepCreateSchema).min(1)
});

export const UpdateWorkflowInputSchema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    platformConfig: PlatformConfigSchema.optional(),
    steps: z.array(WorkflowStepUpdateSchema).min(1)
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
