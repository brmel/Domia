import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { SystemMessage, HumanMessage, BaseMessage } from '@langchain/core/messages';
import type {
    ILLMProvider,
    LLMContext,
    LLMEvaluationContext,
    ILogger,
    IConfigService,
    IToolCallingProvider
} from '@domain/ports';
import type { AgentAction, LLMEvaluationDecision } from '@domain/value-objects';
import { LLMError } from '@domain/errors';
import { LLMPlanningUtils } from './LLMPlanningUtils';
import { ActionToolMapper } from '@shared/tooling/ActionToolMapper';
import {
    ACTION_SYSTEM_PROMPT,
    EVALUATION_SYSTEM_PROMPT,
    buildActionUserPrompt,
    buildEvaluationUserPrompt
} from '@shared/prompts/ActionPromptBuilder';
import { LangChainModelFactory } from './LangChainModelFactory';
import { LlmRuntimeConfigResolver } from './LlmRuntimeConfigResolver';

@injectable()
export class LangChainAdapter implements ILLMProvider {
    get providerName(): string {
        return this.modelFactory.describe(this.runtimeConfig.resolve());
    }

    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject('IConfigService') private readonly configService: IConfigService,
        @inject('IToolCallingProvider') private readonly toolCallingProvider: IToolCallingProvider,
        @inject(ActionToolMapper) private readonly actionToolMapper: ActionToolMapper,
        @inject(LlmRuntimeConfigResolver) private readonly runtimeConfig: LlmRuntimeConfigResolver,
        @inject(LangChainModelFactory) private readonly modelFactory: LangChainModelFactory,
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

        for (let i = 0; i < retries; i++) {
            try {
                return await this.doGenerateAction(context, correctionContext);
            } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                const error = new LLMError(`Generation failed: ${errorMessage}`);
                this.logger.error(`[LangChainAdapter] system error: ${error.message}`);
                correctionContext = { error: error.message };

                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                lastError = error;
            }
        }

        throw lastError || new LLMError("Failed to generate valid action after retries");
    }

    private async doGenerateAction(
        context: LLMContext,
        correction?: { error: string }
    ): Promise<AgentAction> {
        const systemPrompt = ACTION_SYSTEM_PROMPT;
        const promptText = buildActionUserPrompt(context);
        const config = this.configService.get();
        const isVisionEnabled = config.ai.visionEnabled;
        const runtime = this.runtimeConfig.resolve();
        this.logger.debug(`[LangChainAdapter] Runtime provider=${runtime.provider} model=${runtime.model}${runtime.baseUrl ? ` baseUrl=${runtime.baseUrl}` : ''}`);

        const images = isVisionEnabled
            ? (context.snapshot.screenshots?.length
                ? context.snapshot.screenshots
                : (context.snapshot.screenshot ? [context.snapshot.screenshot] : []))
            : [];

        this.logger.debug(`[LangChainAdapter] Invoking tool-calling provider. Correction active: ${!!correction}`);

        const toolCall = await this.toolCallingProvider.generateToolCall({
            systemPrompt,
            userPrompt: promptText,
            tools: this.actionToolMapper.getModelToolDefinitions(context.availableTools),
            ...(images.length > 0 ? { imagesBase64: images } : {}),
            ...(correction ? { correctionError: correction.error } : {})
        });

        const mapped = this.actionToolMapper.mapModelToolCallToAction(toolCall.name, toolCall.args);
        this.logger.debug(`[LangChainAdapter] Native tool call mapped to action: ${toolCall.name}`);
        return mapped;
    }

    private async doGenerateEvaluation(context: LLMEvaluationContext): Promise<LLMEvaluationDecision> {
        const toolCall = await this.toolCallingProvider.generateToolCall({
            systemPrompt: EVALUATION_SYSTEM_PROMPT,
            userPrompt: buildEvaluationUserPrompt(context),
            tools: this.actionToolMapper.getEvaluationToolDefinitions()
        });

        return this.actionToolMapper.mapModelToolCallToEvaluationDecision(toolCall.name, toolCall.args);
    }

    generatePlan(prompt: string): ResultAsync<import('@domain/entities/Plan').Plan, LLMError> {
        return ResultAsync.fromPromise(
            this.doGeneratePlan(prompt),
            (e) => e instanceof LLMError ? e : new LLMError(`Plan generation failed: ${String(e)}`)
        );
    }

    private async doGeneratePlan(prompt: string): Promise<import('@domain/entities/Plan').Plan> {
        const runtime = this.runtimeConfig.resolve();
        const planningModel = this.modelFactory.createPlanningModel(runtime);
        const messages: BaseMessage[] = [
            new SystemMessage(LLMPlanningUtils.systemPrompt),
            new HumanMessage(`User Request: "${prompt}"`)
        ];

        const response = await planningModel.invoke(messages);
        let content = '';
        if (typeof response.content === 'string') {
            content = response.content;
        } else if (Array.isArray(response.content)) {
            content = response.content.map(c => ('text' in c ? c.text : '')).join('');
        }

        const result = LLMPlanningUtils.parsePlan(content);
        if (result.isErr()) {
            throw new LLMError(result.error.message);
        }
        return result.value;
    }
}
