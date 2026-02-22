import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { container } from '../src/composition-root';
import { RunTestUseCase } from '../src/application/use-cases';
import { IPersistenceAdapter } from '../src/domain/ports';
import { ConfigService } from '../src/infrastructure/config/ConfigService';
import { ExecutionController } from '../src/application/controllers/ExecutionController';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';
import { RunTestInput } from '../src/application/dtos';
import { FileTraceExporter } from '../src/infrastructure/services/exporters/FileTraceExporter';
import { TrajectoryExportService } from '../src/infrastructure/services/exporters/TrajectoryExportService';
import { TraceService } from '../src/infrastructure/services/TraceService';
import { RunInputSchema } from '../src/shared/validation';
import { AgentActionSchema } from '../src/shared/validation/agentAction';
import type { AgentAction } from '../src/domain/value-objects';
import { RuntimeReadinessPolicyService } from '../src/application/services/hardening/RuntimeReadinessPolicyService';
import {
    CreateNextWorkflowVersionInputSchema,
    CreateWorkflowInputSchema,
    GetWorkflowRunDetailsInputSchema,
    PublishWorkflowInputSchema,
    StartWorkflowRunInputSchema,
    UpdateWorkflowInputSchema
} from '../src/shared/validation/workflow';
import { WorkflowRunOrchestratorService } from '../src/application/services/workflow/WorkflowRunOrchestratorService';
import { WorkflowDefinitionService } from '../src/application/services/workflow/WorkflowDefinitionService';
import type { PlatformConfig } from '../src/domain/types/PlatformConfig';
import type { RunTestOutput } from '../src/application/dtos';
import type { WorkflowEvent } from '../src/domain/events/WorkflowEvent';
import debug from 'debug';

const t = initTRPC.create({ isServer: true });

let currentController: ExecutionController | null = null;
let currentWorkflowController: ExecutionController | null = null;
let currentWorkflowExecutionToken = 0;
const eventEmitter = new EventEmitter();

export const appRouter = t.router({
    test: t.router({
        run: t.procedure
            .input(RunInputSchema)
            .mutation(async ({ input }: { input: z.infer<typeof RunInputSchema> }) => {
                const useCase = container.resolve<RunTestUseCase>('RunTestUseCase');
                if (currentController) {
                    currentController.stop();
                }
                currentController = new ExecutionController();

                if (input.options?.debug) {
                    debug.enable('domia:*');
                }

                if (input.options?.verbose) {
                    const traceService = container.resolve(TraceService);
                    const storage = container.resolve<import('../src/domain/ports/IStorageService').IStorageService>('IStorageService');
                    traceService.addExporter(new FileTraceExporter(storage));
                }

                try {
                    const generator = useCase.execute(input as RunTestInput, currentController);

                    (async () => {
                        for await (const event of generator) {
                            eventEmitter.emit('test:update', event);
                        }
                    })().catch(err => {
                        eventEmitter.emit('test:update', {
                            type: 'error',
                            error: { name: 'Error', message: String(err), code: 'UNKNOWN' }
                        });
                    }).finally(() => {
                        currentController = null;
                    });

                    return { success: true };
                } catch (error) {
                    return { success: false, error: String(error) };
                }
            }),

        cancel: t.procedure.mutation(() => {
            if (currentController) {
                currentController.stop();
                return { success: true };
            }
            return { success: false, message: 'No test running' };
        }),

        pause: t.procedure.mutation(() => {
            if (currentController) {
                currentController.pause();
                return { success: true };
            }
            return { success: false, message: 'No test running' };
        }),

        resume: t.procedure.mutation(() => {
            if (currentController) {
                currentController.resume();
                return { success: true };
            }
            return { success: false, message: 'No test running' };
        }),

        overrideAction: t.procedure
            .input(z.object({ action: AgentActionSchema }))
            .mutation(({ input }) => {
                if (!currentController) {
                    return { success: false, message: 'No test running' };
                }

                currentController.queueActionOverride(input.action as unknown as AgentAction);
                return { success: true };
            }),

        onUpdate: t.procedure.subscription(() => {
            return observable<RunTestOutput>((emit) => {
                const onUpdate = (data: RunTestOutput) => {
                    emit.next(data);
                };
                eventEmitter.on('test:update', onUpdate);
                return () => {
                    eventEmitter.off('test:update', onUpdate);
                };
            });
        }),

        getCheckpoints: t.procedure
            .input(z.object({ runId: z.string() }))
            .query(async ({ input }) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const checkpointsResult = await persistence.getCheckpointRecords(input.runId);

                if (checkpointsResult.isErr()) {
                    throw new Error(checkpointsResult.error.message);
                }

                return checkpointsResult.value;
            }),

        getReadiness: t.procedure
            .input(z.object({ runId: z.string() }))
            .query(async ({ input }) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const runResult = await persistence.getTestRun(input.runId);

                if (runResult.isErr()) {
                    throw new Error(runResult.error.message);
                }

                const run = runResult.value;
                if (!run) {
                    throw new Error(`Run not found: ${input.runId}`);
                }

                const readinessPolicy = container.resolve(RuntimeReadinessPolicyService);
                const decision = readinessPolicy.assess(
                    {
                        prompt: run.prompt,
                        options: {}
                    },
                    run.url
                );

                return {
                    runId: run.id,
                    ...decision
                };
            }),
    }),

    desktop: t.router({
        getSources: t.procedure.query(async () => {
            const { desktopCapturer } = require('electron');
            const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
            return sources.map((source: Electron.DesktopCapturerSource) => ({
                id: source.id,
                name: source.name,
                thumbnail: source.thumbnail.toDataURL()
            }));
        })
    }),

    history: t.router({
        getRuns: t.procedure.query(async () => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const result = await persistence.getTestRuns();
            if (result.isErr()) throw new Error(result.error.message);
            return result.value;
        }),
        getRun: t.procedure
            .input(z.object({ id: z.string() }))
            .query(async ({ input }: { input: { id: string } }) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const runResult = await persistence.getTestRun(input.id);
                if (runResult.isErr()) throw new Error(runResult.error.message);
                if (!runResult.value) return null;

                const stepsResult = await persistence.getTestSteps(input.id);
                if (stepsResult.isErr()) throw new Error(stepsResult.error.message);

                return {
                    ...runResult.value,
                    steps: stepsResult.value
                };
            }),
        clear: t.procedure.mutation(async () => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const result = await persistence.clearHistory();
            if (result.isErr()) throw new Error(result.error.message);
            return { success: true };
        }),
        getStepArtifacts: t.procedure
            .input(z.object({ runId: z.string(), stepNumber: z.number() }))
            .query(async ({ input }) => {
                const storage = container.resolve<import('../src/domain/ports/IStorageService').IStorageService>('IStorageService');
                const artifacts = await storage.getStepArtifacts(input.runId, input.stepNumber);
                return artifacts;
            }),
        exportTrajectories: t.procedure
            .input(z.object({
                runIds: z.array(z.string().trim().min(1)).optional(),
                workflowDefinitionId: z.string().trim().min(1).optional(),
                from: z.string().datetime().optional(),
                to: z.string().datetime().optional(),
                includeChosenRejected: z.boolean().optional()
            }).optional())
            .mutation(async ({ input }) => {
                const exportService = container.resolve(TrajectoryExportService);
                return exportService.export({
                    ...(input?.runIds ? { runIds: input.runIds } : {}),
                    ...(input?.workflowDefinitionId ? { workflowDefinitionId: input.workflowDefinitionId } : {}),
                    ...(input?.from ? { from: input.from } : {}),
                    ...(input?.to ? { to: input.to } : {}),
                    ...(input?.includeChosenRejected !== undefined ? { includeChosenRejected: input.includeChosenRejected } : {})
                });
            })
    }),

    workflow: t.router({
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
                if (currentWorkflowController) {
                    currentWorkflowController.stop();
                }
                currentWorkflowController = new ExecutionController();
                currentWorkflowExecutionToken += 1;
                const executionToken = currentWorkflowExecutionToken;

                const workflowOrchestrator = container.resolve(WorkflowRunOrchestratorService);

                (async () => {
                    const generator = workflowOrchestrator.executeWorkflow(input.workflowDefinitionId, currentWorkflowController as ExecutionController);
                    for await (const event of generator) {
                        if (executionToken !== currentWorkflowExecutionToken) {
                            break;
                        }
                        eventEmitter.emit('workflow:update', event);
                    }
                })().catch((error) => {
                    if (executionToken !== currentWorkflowExecutionToken) {
                        return;
                    }
                    eventEmitter.emit('workflow:update', {
                        type: 'workflow_failed',
                        workflowRunId: 'unknown',
                        reason: String(error)
                    });
                }).finally(() => {
                    if (executionToken === currentWorkflowExecutionToken) {
                        currentWorkflowController = null;
                    }
                });

                return { success: true };
            }),

        cancel: t.procedure.mutation(() => {
            if (!currentWorkflowController) {
                return { success: false, message: 'No workflow running' };
            }

            currentWorkflowController.stop();
            currentWorkflowExecutionToken += 1;
            currentWorkflowController = null;
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
    }),

    settings: t.router({
        get: t.procedure.query(() => {
            const configService = container.resolve<ConfigService>(ConfigService);
            return configService.get();
        }),
        update: t.procedure
            .input(z.any()) // Validation handled by ConfigService/Zod inside
            .mutation(({ input }) => {
                const configService = container.resolve<ConfigService>(ConfigService);
                configService.update(input);
                return { success: true };
            })
    })
});

export type AppRouter = typeof appRouter;

function toPlatformConfig(value: z.infer<typeof RunInputSchema.shape.platformConfig>): PlatformConfig {
    if (value.platform === 'web') {
        return {
            platform: 'web',
            url: value.url
        };
    }

    const connection = value.connection;
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
