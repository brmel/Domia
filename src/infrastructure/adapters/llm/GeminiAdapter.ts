import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import type {
    ILLMProvider,
    LLMContext,
    LLMEvaluationContext,
    ILogger,
    IConfigService,
    IToolCallingProvider
} from '@domain/ports';
import type { AgentAction, LLMEvaluationDecision } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { LLMError } from '@domain/errors';
import { LLMPlanningUtils } from './LLMPlanningUtils';
import { ActionToolMapper } from '@shared/tooling/ActionToolMapper';
import {
    ACTION_SYSTEM_PROMPT,
    EVALUATION_SYSTEM_PROMPT,
    buildActionUserPrompt,
    buildEvaluationUserPrompt
} from '@shared/prompts/ActionPromptBuilder';
import { GeminiModelFactory } from './GeminiModelFactory';
import { LlmRuntimeConfigResolver } from './LlmRuntimeConfigResolver';
import { ToolCallingFailurePolicy } from './ToolCallingFailurePolicy';

@injectable()
export class GeminiAdapter implements ILLMProvider {
    get providerName(): string {
        return this.modelFactory.describe(this.runtimeConfig.resolve());
    }

    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject('IConfigService') private readonly configService: IConfigService,
        @inject('IToolCallingProvider') private readonly toolCallingProvider: IToolCallingProvider,
        @inject(ActionToolMapper) private readonly actionToolMapper: ActionToolMapper,
        @inject(LlmRuntimeConfigResolver) private readonly runtimeConfig: LlmRuntimeConfigResolver,
        @inject(GeminiModelFactory) private readonly modelFactory: GeminiModelFactory,
        @inject(ToolCallingFailurePolicy) private readonly toolCallingFailurePolicy: ToolCallingFailurePolicy,
    ) {}

    generateAction(context: LLMContext): ResultAsync<AgentAction, LLMError> {
        return ResultAsync.fromPromise(
            this.generateWithRetry(context),
            (e) => e instanceof LLMError ? e : new LLMError(`Generation failed: ${String(e)}`)
        );
    }

    generateEvaluation(context: LLMEvaluationContext): ResultAsync<LLMEvaluationDecision, LLMError> {
        return ResultAsync.fromPromise(
            this.doGenerateEvaluation(context),
            (e) => e instanceof LLMError ? e : new LLMError(`Evaluation generation failed: ${String(e)}`)
        );
    }

    private async generateWithRetry(context: LLMContext, retries = 3): Promise<AgentAction> {
        let lastError: LLMError | undefined;
        let correctionContext: { error: string } | undefined;

        for (let attempt = 1; attempt <= retries; attempt++) {
            const outcome = await this.doGenerateAction(context, correctionContext);

            if (outcome.ok) {
                return outcome.action;
            }

            const failureAction = this.toolCallingFailurePolicy.resolve(outcome.failure, attempt, retries);
            this.logger.warn('[GeminiAdapter] Tool-calling failed during action generation', {
                code: outcome.failure.code,
                attempt,
                maxAttempts: retries,
                decision: failureAction.type,
                message: outcome.failure.message
            });

            if (failureAction.type === 'fail') {
                lastError = new LLMError(`Generation failed: ${failureAction.reason}`);
                break;
            }

            if (failureAction.type === 'retry_with_correction') {
                correctionContext = { error: failureAction.reason };
            }

            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        throw lastError || new LLMError("Failed to generate valid action after retries");
    }

    private async doGenerateAction(
        context: LLMContext,
        correction?: { error: string }
    ): Promise<{ ok: true; action: AgentAction } | { ok: false; failure: import('@domain/ports').ToolCallingFailure }> {
        const runtime = this.runtimeConfig.resolve();
        this.logger.debug(`[GeminiAdapter] Runtime provider=${runtime.provider} model=${runtime.model}${runtime.baseUrl ? ` baseUrl=${runtime.baseUrl}` : ''}`);

        const request = this.buildActionRequest(context, correction);
        const outcome = await this.toolCallingProvider.generateToolCallOutcome(request);

        if (!outcome.ok) {
            return { ok: false, failure: outcome.failure };
        }

        const mapped = this.actionToolMapper.mapModelToolCallToAction(outcome.result.name, outcome.result.args);
        this.logger.debug(`[GeminiAdapter] Tool call mapped to action: ${outcome.result.name}`);
        return { ok: true, action: mapped };
    }

    private buildActionRequest(context: LLMContext, correction?: { error: string }): import('@domain/ports').ToolCallingRequest {
        const config = this.configService.get();
        const isVisionEnabled = config.ai.visionEnabled;
        const images = isVisionEnabled
            ? (context.snapshot.screenshots?.length
                ? context.snapshot.screenshots
                : (context.snapshot.screenshot ? [context.snapshot.screenshot] : []))
            : [];

        return {
            systemPrompt: ACTION_SYSTEM_PROMPT,
            userPrompt: buildActionUserPrompt(context),
            tools: this.actionToolMapper.getModelToolDefinitions(context.availableTools),
            ...(images.length > 0 ? { imagesBase64: images } : {}),
            ...(correction ? { correctionError: correction.error } : {})
        };
    }

    private async doGenerateEvaluation(context: LLMEvaluationContext): Promise<LLMEvaluationDecision> {
        const maxAttempts = 2;
        let correctionContext: { error: string } | undefined;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const request = this.buildEvaluationRequest(context, correctionContext);
            const outcome = await this.toolCallingProvider.generateToolCallOutcome(request);

            if (outcome.ok) {
                return this.actionToolMapper.mapModelToolCallToEvaluationDecision(outcome.result.name, outcome.result.args);
            }

            if (attempt < maxAttempts && outcome.failure.retryable) {
                this.logger.warn('[GeminiAdapter] Evaluator tool-calling failed; retrying with correction', {
                    code: outcome.failure.code,
                    attempt,
                    message: outcome.failure.message
                });
                correctionContext = { error: outcome.failure.message };
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            this.logger.warn('[GeminiAdapter] Evaluator failed; using deterministic fallback', {
                code: outcome.failure.code,
                message: outcome.failure.message
            });

            return this.buildFallbackEvaluationDecision(context, outcome.failure.message);
        }

        return this.buildFallbackEvaluationDecision(context, 'Evaluator exhausted retry attempts');
    }

    private buildEvaluationRequest(
        context: LLMEvaluationContext,
        correction?: { error: string }
    ): import('@domain/ports').ToolCallingRequest {
        return {
            systemPrompt: EVALUATION_SYSTEM_PROMPT,
            userPrompt: buildEvaluationUserPrompt(context),
            tools: this.actionToolMapper.getEvaluationToolDefinitions(),
            ...(correction ? { correctionError: correction.error } : {})
        };
    }

    private buildFallbackEvaluationDecision(
        context: LLMEvaluationContext,
        failureMessage: string
    ): LLMEvaluationDecision {
        if (context.executionOutcome === 'execution_error') {
            return {
                decision: 'need_retry',
                summary: 'Execution reported an error; retry with a simpler interaction.',
                advice: context.executionError ?? 'Retry with a single concrete interaction and re-check visible state.',
                confidence: 0.6,
                evidence: [
                    context.executionError ?? 'Execution error reported.',
                    `Evaluator fallback engaged: ${failureMessage}`
                ]
            };
        }

        if (context.attemptedAction.type === ActionType.PASS) {
            return {
                decision: 'need_retry',
                summary: 'Pass attempt requires one concrete verification action first.',
                advice: 'Run one explicit verification action (for example extract visible labels), then reassess pass.',
                confidence: 0.58,
                evidence: [
                    'Attempted action was PASS.',
                    `Evaluator fallback engaged: ${failureMessage}`
                ]
            };
        }

        return {
            decision: 'need_retry',
            summary: 'Evaluator output was invalid; continue with one focused verification action.',
            advice: 'Do not repeat the same action blindly; choose one concrete evidence-gathering action.',
            confidence: 0.55,
            evidence: [
                context.executionObservation ?? 'Current snapshot available for another verification action.',
                `Evaluator fallback engaged: ${failureMessage}`
            ]
        };
    }

    generatePlan(prompt: string): ResultAsync<import('@domain/entities/Plan').Plan, LLMError> {
        return ResultAsync.fromPromise(
            this.doGeneratePlan(prompt),
            (e) => e instanceof LLMError ? e : new LLMError(`Plan generation failed: ${String(e)}`)
        );
    }

    private async doGeneratePlan(prompt: string): Promise<import('@domain/entities/Plan').Plan> {
        const runtime = this.runtimeConfig.resolve();
        const model = this.modelFactory.createPlanningModel(runtime);

        const response = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{ text: `User Request: "${prompt}"` }]
            }],
            systemInstruction: LLMPlanningUtils.systemPrompt
        });

        const candidate = response.response.candidates?.[0];
        let content = '';
        if (candidate?.content?.parts) {
            content = candidate.content.parts
                .filter((p: import('@google/generative-ai').Part) => 'text' in p && p.text)
                .map((p: import('@google/generative-ai').Part) => ('text' in p ? p.text : ''))
                .join('');
        }

        const result = LLMPlanningUtils.parsePlan(content);
        if (result.isErr()) {
            throw new LLMError(result.error.message);
        }
        return result.value;
    }
}
