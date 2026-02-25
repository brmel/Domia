import { injectable, inject } from 'tsyringe';
import { LlmAgent, Gemini, Runner, InMemorySessionService, getFunctionCalls, isFinalResponse, stringifyContent } from '@google/adk';
import type { Content, Part } from '@google/genai';
import type { IAppAutomation, IPerceptionPipeline, ILogger } from '@domain/ports';
import type { IAgentRunner, AgentRunnerEvent, StepExecutionResult, StepRunnerConfig } from '@domain/ports/IAgentRunner';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import { ActionType } from '@domain/enums/ActionType';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import { createAdkTools } from './AdkToolFactory';
import { formatElements } from '../tools/ToolSpec';
import { ActionMapper } from '../agent/common/ActionMapper';
import { AgentLoopGuard } from '../agent/common/AgentLoopGuard';
import { buildAgentInstruction } from '../agent/common/AgentInstructionBuilder';

const APP_NAME = 'domia';

function extractThought(event: { content?: { parts?: Array<{ text?: string }> } }): string {
    if (!event.content?.parts) return '';
    return event.content.parts
        .filter((p): p is { text: string } => typeof p.text === 'string' && p.text.trim().length > 0)
        .map(p => p.text.trim())
        .join('\n');
}

@injectable()
export class AdkAgentRunner implements IAgentRunner {
    constructor(
        @inject('IPerceptionPipeline') private readonly perception: IPerceptionPipeline,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(LlmRuntimeConfigResolver) private readonly llmConfigResolver: LlmRuntimeConfigResolver,
    ) {}

    async *executeStep(
        config: StepRunnerConfig,
        automation: IAppAutomation,
    ): AsyncGenerator<AgentRunnerEvent, StepExecutionResult, unknown> {
        const { stepGoal, url, maxActions, vision } = config;

        const llmConfig = this.llmConfigResolver.resolve();
        if (!llmConfig.apiKey) {
            return {
                success: false, terminal: 'error', code: 'llm_error',
                reason: 'No API key configured. Set GOOGLE_API_KEY, GEMINI_API_KEY, or DOMIA_LLM_API_KEY.',
            };
        }
        const model = llmConfig.model || 'gemini-2.0-flash';

        const initialFrame = await this.perception.capture(automation, { vision, aria: true, dom: true });
        if (initialFrame.isErr()) {
            return {
                success: false, terminal: 'error', code: 'perception_error',
                reason: `Initial perception failed: ${initialFrame.error.message}`,
            };
        }

        const frame = initialFrame.value;
        const viewport = await automation.getViewportSize();

        let latestCapturedFrame: PerceptionFrame | undefined;
        let actionCount = 0;

        const { tools, catalog } = createAdkTools({
            automation,
            perception: this.perception,
            vision,
            onCapture: async (capturedFrame) => {
                latestCapturedFrame = capturedFrame;
            },
        });

        const actionMapper = new ActionMapper(catalog);
        const loopGuard = new AgentLoopGuard();
        const instruction = buildAgentInstruction(catalog);

        const elementsStr = formatElements(frame.semantic.dom.elements);
        const textPart: Part = {
            text: `GOAL: ${stepGoal}\n\nVIEWPORT: ${viewport.width}x${viewport.height} pixels\n\nCURRENT PAGE:\nURL: ${frame.metadata.url || url}\nTitle: ${frame.metadata.title}\n\nINTERACTIVE ELEMENTS (with bounding boxes [x,y,w,h]):\n${elementsStr}\n\nMAX ACTIONS REMAINING: ${maxActions}\n\nAnalyze the current page state and begin working toward the goal. Call exactly one tool per turn.`,
        };

        const parts: Part[] = [textPart];
        if (vision && frame.vision.primaryScreenshot) {
            parts.push({
                inlineData: {
                    data: frame.vision.primaryScreenshot.toString('base64'),
                    mimeType: frame.vision.mimeType,
                },
            });
        }

        const initialMessage: Content = { role: 'user', parts };

        const agent = new LlmAgent({
            name: 'app_agent',
            model: new Gemini({ model, apiKey: llmConfig.apiKey }),
            instruction,
            tools,
            generateContentConfig: { temperature: 0 },
            beforeToolCallback: ({ tool, args }) => {
                const sig = `${tool.name}:${JSON.stringify(args)}`;
                loopGuard.record(tool.name, args as Record<string, unknown>);
                if (loopGuard.isLoop()) {
                    this.logger.warn(`[AdkAgentRunner] Loop detected: ${sig}`);
                    return { status: 'error', error: loopGuard.getWarning(tool.name) };
                }
                return undefined;
            },
        });

        const sessionService = new InMemorySessionService();
        const runner = new Runner({ appName: APP_NAME, agent, sessionService });
        const session = await sessionService.createSession({
            appName: APP_NAME, userId: 'domia', sessionId: config.runId,
        });

        try {
            for await (const event of runner.runAsync({
                userId: session.userId,
                sessionId: session.id,
                newMessage: initialMessage,
                runConfig: { maxLlmCalls: maxActions + 2 },
            })) {
                const functionCalls = getFunctionCalls(event);

                if (functionCalls?.length) {
                    const thought = extractThought(event);

                    for (const fc of functionCalls) {
                        const action = actionMapper.map(fc.name!, fc.args as Record<string, unknown>, thought);
                        actionCount++;

                        this.logger.info(`[AdkAgentRunner] Action ${actionCount}/${maxActions}: ${fc.name}`, fc.args);

                        const capturedFrame = actionCount === 1 ? frame : latestCapturedFrame;
                        latestCapturedFrame = undefined;

                        const { thought: _t, ...actionWithoutThought } = action as unknown as Record<string, unknown>;

                        yield {
                            type: 'action',
                            action,
                            actionIndex: actionCount,
                            trace: {
                                timestamp: Date.now(),
                                agentInput: {
                                    goal: stepGoal,
                                    currentUrl: url,
                                    promptPreview: `GOAL: ${stepGoal} | URL: ${url} | Action ${actionCount}/${maxActions}`,
                                },
                                agentOutput: {
                                    thought,
                                    action: actionWithoutThought as Record<string, unknown>,
                                    rawResponse: JSON.stringify(event.content ?? {}, null, 2),
                                },
                                toolCall: {
                                    name: fc.name!,
                                    input: fc.args as Record<string, unknown>,
                                },
                            },
                            capturedFrame,
                        };

                        if (action.type === ActionType.PASS) {
                            return { success: true, terminal: 'pass' };
                        }
                        if (action.type === ActionType.FAIL) {
                            return {
                                success: false, terminal: 'fail', code: 'agent_fail',
                                reason: (action as { reason: string }).reason,
                            };
                        }
                        if (actionCount >= maxActions) {
                            return {
                                success: false, terminal: 'max_actions', code: 'max_actions_reached',
                                reason: `Max actions (${maxActions}) reached for step: ${stepGoal}`,
                            };
                        }
                    }
                }

                if (isFinalResponse(event)) {
                    const text = stringifyContent(event);
                    this.logger.info(`[AdkAgentRunner] Final response: ${text.slice(0, 200)}`);
                    if (actionCount === 0) {
                        return {
                            success: false, terminal: 'fail', code: 'agent_fail',
                            reason: 'Agent generated text without calling any tools',
                        };
                    }
                    break;
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[AdkAgentRunner] Agent error: ${message}`);
            return {
                success: false, terminal: 'error', code: 'llm_error',
                reason: `ADK agent error: ${message}`,
            };
        }

        return {
            success: false, terminal: 'max_actions', code: 'max_actions_reached',
            reason: `Agent finished without calling pass/fail. Completed ${actionCount} actions.`,
        };
    }
}
