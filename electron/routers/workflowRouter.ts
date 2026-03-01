import { z } from 'zod';
import { container } from '../../src/composition-root';
import { IPersistenceAdapter } from '../../src/domain/ports';
import { ExecutionController } from '../../src/application/controllers/ExecutionController';
import { observable } from '@trpc/server/observable';
import {
    CreateNextWorkflowVersionInputSchema,
    CreateWorkflowInputSchema,
    GetWorkflowRunDetailsInputSchema,
    PublishWorkflowInputSchema,
    StartWorkflowRunInputSchema,
    UpdateWorkflowInputSchema
} from '../../src/shared/validation/workflow';
import { WorkflowRunOrchestratorService } from '../../src/application/services/workflow/WorkflowRunOrchestratorService';
import { WorkflowDefinitionService } from '../../src/application/services/workflow/WorkflowDefinitionService';
import type { PlatformConfig } from '../../src/domain/types/PlatformConfig';
import type { WorkflowEvent } from '../../src/domain/events/WorkflowEvent';
import { RunInputSchema } from '../../src/shared/validation';
import { t, eventEmitter, workflowControllerState } from './shared';

function toPlatformConfig(value: z.infer<typeof RunInputSchema.shape.platformConfig>): PlatformConfig {
    if (value.platform === 'web') {
        return {
            platform: 'web',
            url: value.url
        };
    }

    // At this point, only electron platform remains (android/ios are not in the Zod schema for this router)
    const connection = (value as unknown as { connection: { type: string; cdpUrl: string; executablePath: string; windowTitle?: string; launchArgs?: string[] } }).connection;
    if (connection.type === 'cdp') {
        return {
            platform: 'electron',
            connection: {
                type: 'cdp',
                cdpUrl: connection.cdpUrl,
                ...(connection.windowTitle ? { windowTitle: connection.windowTitle } : {})
            }
        };
    }

    return {
        platform: 'electron',
        connection: {
            type: 'executable',
            executablePath: connection.executablePath,
            ...(connection.launchArgs ? { launchArgs: connection.launchArgs } : {}),
            ...(connection.windowTitle ? { windowTitle: connection.windowTitle } : {})
        }
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
                steps: input.steps.map((step) => ({
                    name: step.name,
                    prompt: step.prompt,
                    continueOnFailure: step.continueOnFailure,
                    ...(step.options ? { options: step.options } : {})
                }))
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
                steps: input.steps.map((step) => ({
                    ...(step.id ? { id: step.id } : {}),
                    name: step.name,
                    prompt: step.prompt,
                    continueOnFailure: step.continueOnFailure,
                    ...(step.options ? { options: step.options } : {})
                }))
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

            if (result.isErr()) {
                throw new Error(result.error.message);
            }

            return result.value;
        }),

    getDefinitions: t.procedure
        .input(z.object({ limit: z.number().int().positive().optional() }).optional())
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const result = await persistence.getWorkflowDefinitions(input?.limit);

            if (result.isErr()) {
                throw new Error(result.error.message);
            }

            return result.value;
        }),

    getRuns: t.procedure
        .input(z.object({ limit: z.number().int().positive().optional() }).optional())
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const runsResult = await persistence.getWorkflowRuns(input?.limit);

            if (runsResult.isErr()) {
                throw new Error(runsResult.error.message);
            }

            return runsResult.value;
        }),

    getStepRuns: t.procedure
        .input(z.object({ workflowRunId: z.string().trim().min(1) }))
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const stepRunsResult = await persistence.getWorkflowStepRuns(input.workflowRunId);

            if (stepRunsResult.isErr()) {
                throw new Error(stepRunsResult.error.message);
            }

            return stepRunsResult.value;
        }),

    getRunDetails: t.procedure
        .input(GetWorkflowRunDetailsInputSchema)
        .query(async ({ input }) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const runResult = await persistence.getWorkflowRun(input.workflowRunId);
            if (runResult.isErr()) {
                throw new Error(runResult.error.message);
            }

            if (!runResult.value) {
                return null;
            }

            const stepRunsResult = await persistence.getWorkflowStepRuns(input.workflowRunId);
            if (stepRunsResult.isErr()) {
                throw new Error(stepRunsResult.error.message);
            }

            return {
                run: runResult.value,
                stepRuns: stepRunsResult.value
            };
        }),

    start: t.procedure
        .input(StartWorkflowRunInputSchema)
        .mutation(async ({ input }) => {
            if (workflowControllerState.current) {
                workflowControllerState.current.stop();
            }
            workflowControllerState.current = new ExecutionController();
            workflowControllerState.executionToken += 1;
            const executionToken = workflowControllerState.executionToken;

            const workflowOrchestrator = container.resolve(WorkflowRunOrchestratorService);

            (async () => {
                const generator = workflowOrchestrator.executeWorkflow(input.workflowDefinitionId, workflowControllerState.current as ExecutionController);
                for await (const event of generator) {
                    if (executionToken !== workflowControllerState.executionToken) {
                        break;
                    }
                    eventEmitter.emit('workflow:update', event);
                }
            })().catch((error) => {
                if (executionToken !== workflowControllerState.executionToken) {
                    return;
                }
                eventEmitter.emit('workflow:update', {
                    type: 'workflow_failed',
                    workflowRunId: 'unknown',
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
