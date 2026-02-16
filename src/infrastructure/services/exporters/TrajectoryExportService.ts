import { inject, injectable } from 'tsyringe';
import fs from 'fs-extra';
import path from 'path';
import type { AgentAction } from '@domain/value-objects';
import type { IPersistenceAdapter, IStorageService, ILogger } from '@domain/ports';
import type {
    TrajectoryExportBundle,
    TrajectoryExportResult,
    TrajectoryFilter,
    TrajectoryStepRecord
} from '@domain/trajectory/TrajectoryExport';
import { ConfigService } from '@infrastructure/config/ConfigService';

interface StepTraceEvent {
    readonly timestamp?: number;
    readonly agentInput?: {
        readonly goal?: string;
        readonly currentUrl?: string;
        readonly promptPreview?: string;
        readonly timelineSummary?: string;
    };
    readonly agentOutput?: {
        readonly action?: AgentAction | null;
        readonly rawResponse?: string;
    };
}

@injectable()
export class TrajectoryExportService {
    constructor(
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter,
        @inject('IStorageService') private readonly storage: IStorageService,
        @inject(ConfigService) private readonly configService: ConfigService,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    async export(filters: TrajectoryFilter): Promise<TrajectoryExportResult> {
        const runIds = await this.resolveRunIds(filters);
        const trajectories: TrajectoryStepRecord[] = [];

        for (const runId of runIds) {
            const runResult = await this.persistence.getTestRun(runId);
            if (runResult.isErr() || !runResult.value) {
                continue;
            }

            const stepsResult = await this.persistence.getTestSteps(runId);
            if (stepsResult.isErr()) {
                continue;
            }

            for (const step of stepsResult.value) {
                const artifacts = await this.storage.getStepArtifacts(runId, step.stepNumber);
                const trace = (artifacts.trace ?? {}) as { events?: StepTraceEvent[]; agentInput?: StepTraceEvent['agentInput']; agentOutput?: StepTraceEvent['agentOutput'] };
                const events = Array.isArray(trace.events) ? trace.events : [];

                const modelProposal = this.findModelProposal(events, trace.agentOutput);
                const operatorCorrection = this.findOperatorCorrection(events);
                const evaluatorOutcome = this.findEvaluatorOutcome(events, trace.agentOutput);

                const record: TrajectoryStepRecord = {
                    runId,
                    stepNumber: step.stepNumber,
                    contextSnapshot: {
                        goal: runResult.value.prompt,
                        currentUrl: runResult.value.url,
                        ...(trace.agentInput?.promptPreview ? { promptPreview: trace.agentInput.promptPreview } : {}),
                        ...(trace.agentInput?.timelineSummary ? { timelineSummary: trace.agentInput.timelineSummary } : {})
                    },
                    ...(modelProposal ? { modelProposal } : {}),
                    ...(operatorCorrection ? { operatorCorrection } : {}),
                    finalExecutedAction: step.actionPayload,
                    ...(evaluatorOutcome ? { evaluatorOutcome } : {})
                };

                if (filters.includeChosenRejected === false) {
                    const { modelProposal: _ignoredProposal, operatorCorrection: _ignoredCorrection, ...withoutChosenRejected } = record;
                    trajectories.push(withoutChosenRejected);
                    continue;
                }

                trajectories.push(record);
            }
        }

        const bundle: TrajectoryExportBundle = {
            generatedAt: new Date().toISOString(),
            filters,
            trajectories
        };

        const exportPath = await this.writeBundle(bundle);
        this.logger.info('[TrajectoryExportService] Trajectories exported', {
            exportPath,
            count: trajectories.length
        });

        return {
            filePath: exportPath,
            exportedCount: trajectories.length
        };
    }

    private async resolveRunIds(filters: TrajectoryFilter): Promise<readonly string[]> {
        const runsResult = await this.persistence.getTestRuns(2000);
        if (runsResult.isErr()) {
            return [];
        }

        const fromTime = filters.from ? Date.parse(filters.from) : Number.NEGATIVE_INFINITY;
        const toTime = filters.to ? Date.parse(filters.to) : Number.POSITIVE_INFINITY;

        const initialRunIds = runsResult.value
            .filter((run) => {
                const runStartedAt = (run.startedAt ?? run.createdAt).getTime();
                const inDateRange = runStartedAt >= fromTime && runStartedAt <= toTime;
                const runIdMatches = !filters.runIds || filters.runIds.includes(run.id);
                return inDateRange && runIdMatches;
            })
            .map((run) => run.id);

        if (!filters.workflowDefinitionId) {
            return initialRunIds;
        }

        const workflowRunsResult = await this.persistence.getWorkflowRuns(2000);
        if (workflowRunsResult.isErr()) {
            return [];
        }

        const candidateWorkflowRuns = workflowRunsResult.value.filter(
            (workflowRun) => workflowRun.workflowDefinitionId === filters.workflowDefinitionId
        );

        const workflowBoundRunIds = new Set<string>();
        for (const workflowRun of candidateWorkflowRuns) {
            const stepRunsResult = await this.persistence.getWorkflowStepRuns(workflowRun.id);
            if (stepRunsResult.isErr()) {
                continue;
            }

            for (const stepRun of stepRunsResult.value) {
                if (stepRun.testRunId) {
                    workflowBoundRunIds.add(stepRun.testRunId);
                }
            }
        }

        return initialRunIds.filter((runId) => workflowBoundRunIds.has(runId));
    }

    private findModelProposal(events: readonly StepTraceEvent[], fallback?: StepTraceEvent['agentOutput']): AgentAction | undefined {
        const eventWithProposal = events.find((event) => event.agentOutput?.action && event.agentOutput?.rawResponse !== 'operator-action-override');
        if (eventWithProposal?.agentOutput?.action) {
            return eventWithProposal.agentOutput.action;
        }

        if (fallback?.action && fallback.rawResponse !== 'operator-action-override') {
            return fallback.action;
        }

        return undefined;
    }

    private findOperatorCorrection(events: readonly StepTraceEvent[]): AgentAction | undefined {
        const overrideEvent = events.find((event) => event.agentOutput?.rawResponse === 'operator-action-override');
        return overrideEvent?.agentOutput?.action ?? undefined;
    }

    private findEvaluatorOutcome(
        events: readonly StepTraceEvent[],
        fallback?: StepTraceEvent['agentOutput']
    ): { decision: string; summary: string; advice?: string } | undefined {
        const parse = (rawResponse?: string): { decision: string; summary: string; advice?: string } | undefined => {
            if (!rawResponse) {
                return undefined;
            }

            try {
                const parsed = JSON.parse(rawResponse) as { decision?: string; summary?: string; advice?: string };
                if (!parsed.decision || !parsed.summary) {
                    return undefined;
                }

                return {
                    decision: parsed.decision,
                    summary: parsed.summary,
                    ...(parsed.advice ? { advice: parsed.advice } : {})
                };
            } catch {
                return undefined;
            }
        };

        for (let index = events.length - 1; index >= 0; index--) {
            const event = events[index];
            const parsed = parse(event?.agentOutput?.rawResponse);
            if (parsed) {
                return parsed;
            }
        }

        return parse(fallback?.rawResponse);
    }

    private async writeBundle(bundle: TrajectoryExportBundle): Promise<string> {
        const config = this.configService.get();
        const exportDir = path.resolve(config.paths.artifactsDir, 'trajectory-exports');
        await fs.ensureDir(exportDir);

        const fileName = `trajectory-export-${Date.now()}.json`;
        const exportPath = path.join(exportDir, fileName);
        await fs.writeJson(exportPath, bundle, { spaces: 2 });
        return exportPath;
    }
}
