import { z } from 'zod';
import { container } from '@backend/container-root';
import { IPersistenceAdapter } from '@domain/ports';
import { ExecutionController } from '@backend/ExecutionController';
import { observable } from '@trpc/server/observable';
import {
    CreateNextWorkflowVersionInputSchema,
    CreateWorkflowInputSchema,
    GetWorkflowRunDetailsInputSchema,
    PublishWorkflowInputSchema,
    StartWorkflowRunInputSchema,
    UpdateWorkflowInputSchema
} from '@shared/contracts/workflow';
import { WorkflowRunOrchestratorService } from '@backend/workflows/WorkflowRunOrchestratorService';
import { WorkflowDefinitionService } from '@backend/workflows/WorkflowDefinitionService';
import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type { WorkflowEvent } from '@domain/WorkflowEvent';
import { RunInputSchema } from '@shared/contracts/run';
import { WorkflowStepKind } from '@domain/value-objects/WorkflowStepKind';
import { t, eventEmitter, workflowControllerState } from './shared';
import { unwrap } from './unwrap';

function toPlatformConfig(value: z.infer<typeof RunInputSchema.shape.platformConfig>): PlatformConfig {
    return value as PlatformConfig;
}

type IncomingStep =
    | { kind: typeof WorkflowStepKind.Agent; id?: string; name: string; prompt: string; continueOnFailure: boolean; options?: Record<string, unknown> }
    | { kind: typeof WorkflowStepKind.ForEach; id?: string; name: string; items: readonly string[]; bodyPrompt: string; continueOnFailure: boolean; options?: Record<string, unknown> };

function mapStepInput(step: IncomingStep, includeId: boolean): Record<string, unknown> {
    const idBlock = includeId && step.id ? { id: step.id } : {};
    const optionsBlock = step.options ? { options: step.options } : {};
    if (step.kind === WorkflowStepKind.ForEach) {
        return {
            kind: WorkflowStepKind.ForEach,
            ...idBlock,
            name: step.name,
            items: step.items,
            bodyPrompt: step.bodyPrompt,
            continueOnFailure: step.continueOnFailure,
            ...optionsBlock,
        };
    }
    return {
        kind: WorkflowStepKind.Agent,
        ...idBlock,
        name: step.name,
        prompt: step.prompt,
        continueOnFailure: step.continueOnFailure,
        ...optionsBlock,
    };
}

export const workflowRouter = t.router({
    create: t.procedure
        .input(CreateWorkflowInputSchema)
        .mutation(async ({ input }) => {
            const definitionService = container.resolve(WorkflowDefinitionService);
            const definition = await definitionService.createDraft({
                name: input.name,
                ...(input.description ? { description: input.description } : {}),
                platformConfig: toPlatformConfig(input.platformConfig),
                steps: input.steps.map((step) => mapStepInput(step as IncomingStep, false)) as never,
            });
            return { id: definition.id };
        }),

    update: t.procedure
        .input(UpdateWorkflowInputSchema)
        .mutation(async ({ input }) => {
            const definitionService = container.resolve(WorkflowDefinitionService);
            const definition = await definitionService.updateDraft({
                id: input.id,
                name: input.name,
                ...(input.description ? { description: input.description } : {}),
                ...(input.platformConfig ? { platformConfig: toPlatformConfig(input.platformConfig) } : {}),
                steps: input.steps.map((step) => mapStepInput(step as IncomingStep, true)) as never,
            });

            return definition;
        }),

    publish: t.procedure
        .input(PublishWorkflowInputSchema)
        .mutation(async ({ input }) => {
            const definitionService = container.resolve(WorkflowDefinitionService);
            return definitionService.publishDraft(input.workflowDefinitionId);
        }),

    createNextVersion: t.procedure
        .input(CreateNextWorkflowVersionInputSchema)
        .mutation(async ({ input }) => {
            const definitionService = container.resolve(WorkflowDefinitionService);
            return definitionService.createNextDraftVersion(input.sourceWorkflowDefinitionId);
        }),

    getDefinition: t.procedure
        .input(z.object({ workflowDefinitionId: z.string().trim().min(1) }))
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const result = await persistence.getWorkflowDefinition(input.workflowDefinitionId);

            return unwrap(result);
        }),

    getDefinitions: t.procedure
        .input(z.object({ limit: z.number().int().positive().optional() }).optional())
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const result = await persistence.getWorkflowDefinitions(input?.limit);

            return unwrap(result);
        }),

    getRuns: t.procedure
        .input(z.object({ limit: z.number().int().positive().optional() }).optional())
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const runsResult = await persistence.getWorkflowRuns(input?.limit);

            return unwrap(runsResult);
        }),

    getStepRuns: t.procedure
        .input(z.object({ workflowRunId: z.string().trim().min(1) }))
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const stepRunsResult = await persistence.getWorkflowStepRuns(input.workflowRunId);

            return unwrap(stepRunsResult);
        }),

    getRunDetails: t.procedure
        .input(GetWorkflowRunDetailsInputSchema)
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const run = unwrap(await persistence.getWorkflowRun(input.workflowRunId));
            if (!run) {
                return null;
            }

            return {
                run,
                stepRuns: unwrap(await persistence.getWorkflowStepRuns(input.workflowRunId))
            };
        }),

    start: t.procedure
        .input(StartWorkflowRunInputSchema)
        .mutation(async ({ input }) => {
            if (workflowControllerState.current) {
                workflowControllerState.current.stop();
            }
            workflowControllerState.current = new ExecutionController();
            workflowControllerState.current.start();
            workflowControllerState.executionToken += 1;
            const executionToken = workflowControllerState.executionToken;

            const workflowOrchestrator = container.resolve(WorkflowRunOrchestratorService);
            let capturedWorkflowRunId = input.workflowDefinitionId;

            (async () => {
                const generator = workflowOrchestrator.executeWorkflow(input.workflowDefinitionId, workflowControllerState.current as ExecutionController);
                for await (const event of generator) {
                    if (executionToken !== workflowControllerState.executionToken) {
                        break;
                    }
                    if ('workflowRunId' in event) capturedWorkflowRunId = event.workflowRunId;
                    eventEmitter.emit('workflow:update', event);
                }
            })().catch((error) => {
                if (executionToken !== workflowControllerState.executionToken) {
                    return;
                }
                eventEmitter.emit('workflow:update', {
                    type: 'workflow_failed',
                    workflowRunId: capturedWorkflowRunId,
                    reason: String(error)
                });
            }).finally(() => {
                if (executionToken === workflowControllerState.executionToken) {
                    workflowControllerState.current = null;
                }
            });

            return { success: true };
        }),

    cancel: t.procedure.mutation(() => {
        if (!workflowControllerState.current) {
            return { success: false, message: 'No workflow running' };
        }

        workflowControllerState.current.stop();
        workflowControllerState.executionToken += 1;
        workflowControllerState.current = null;
        return { success: true };
    }),

    onUpdate: t.procedure.subscription(() => {
        return observable<WorkflowEvent>((emit) => {
            const onUpdate = (data: WorkflowEvent) => {
                emit.next(data);
            };
            eventEmitter.on('workflow:update', onUpdate);
            return () => {
                eventEmitter.off('workflow:update', onUpdate);
            };
        });
    })
});
