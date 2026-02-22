import { injectable, inject } from 'tsyringe';
import { LlmAgent, Gemini, Runner, InMemorySessionService, getFunctionCalls, isFinalResponse, stringifyContent } from '@google/adk';
import type { Content, Part } from '@google/genai';
import type { IBrowserAutomation, IPerceptionPipeline, IStorageService, ILogger } from '@domain/ports';
import type { IAgentRunner, AgentActionEvent, StepExecutionResult, StepRunnerConfig } from '@domain/ports/IAgentRunner';
import type { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { LlmRuntimeConfigResolver } from '@infrastructure/adapters/llm/LlmRuntimeConfigResolver';
import { createAdkBrowserTools, formatElements } from './AdkBrowserToolFactory';

const APP_NAME = 'domia';

const AGENT_INSTRUCTION = `You are an autonomous web testing agent. You interact with web pages to verify conditions and achieve goals.

CAPABILITIES:
- You can click, type, pressKey, scroll, wait, extract data, and use coordinate mouse controls.
- You receive bounding box coordinates for every element.
- You receive the viewport dimensions to calculate positions.
- Each tool returns the updated DOM state after execution, so you always see the latest page.

LAYOUT ANALYSIS:
To check if an element is horizontally centered:
  - Element center: elementX + (elementWidth / 2)
  - Page center: viewportWidth / 2
  - Centered if: |elementCenter - pageCenter| < 50 pixels

RULES:
1. Analyze elements and their positions before deciding.
2. Use element IDs from the snapshot to target elements.
3. Use navigate only when a page change is truly required; do not navigate to empty or relative URLs.
4. Do not fail on the first uncertainty. Re-check state and try one alternative action when feasible before returning fail.
5. Avoid repeating scroll when the page state is unchanged; after a few no-progress attempts, choose a different action or fail with a clear reason.
6. Do not call pass as your first action. Perform at least one concrete verification action first and only pass when you can cite clear evidence.
7. When the goal requires validating a list/value (e.g., supported languages), use extract on concrete UI elements and base the decision on extracted content, not assumptions.
8. For goals that validate multiple required items, gather explicit evidence for each required item before passing.
9. If the same interaction repeats without producing new evidence, switch to a different action type (prefer extract on relevant visible elements).

Think step by step. Choose exactly one tool call per turn. After each tool call you will see the updated page state.
When the goal is confirmed, call 'pass'. When blocked after multiple attempts, call 'fail' with a concrete reason.`;

function mapFunctionCallToAction(name: string, args: Record<string, unknown>): AgentAction {
    switch (name) {
        case 'click':
            return { type: ActionType.CLICK, elementId: args['elementId'] as number, thought: '' } as AgentAction;
        case 'type':
            return { type: ActionType.TYPE, elementId: args['elementId'] as number, text: args['text'] as string, submit: (args['submit'] as boolean) ?? false, thought: '' } as AgentAction;
        case 'pressKey':
            return { type: ActionType.PRESS_KEY, key: args['key'] as string, thought: '' } as AgentAction;
        case 'scroll':
            return { type: ActionType.SCROLL, direction: args['direction'] as 'up' | 'down', thought: '' } as AgentAction;
        case 'mouse_move':
            return { type: ActionType.MOUSE_MOVE, x: args['x'] as number, y: args['y'] as number, thought: '' } as AgentAction;
        case 'mouse_click_left':
            return { type: ActionType.MOUSE_CLICK_LEFT, x: args['x'] as number, y: args['y'] as number, thought: '' } as AgentAction;
        case 'mouse_click_right':
            return { type: ActionType.MOUSE_CLICK_RIGHT, x: args['x'] as number, y: args['y'] as number, thought: '' } as AgentAction;
        case 'mouse_double_click':
            return { type: ActionType.MOUSE_DOUBLE_CLICK, x: args['x'] as number, y: args['y'] as number, thought: '' } as AgentAction;
        case 'mouse_drag':
            return { type: ActionType.MOUSE_DRAG, fromX: args['fromX'] as number, fromY: args['fromY'] as number, toX: args['toX'] as number, toY: args['toY'] as number, steps: args['steps'] as number | undefined, thought: '' } as AgentAction;
        case 'mouse_scroll':
            return { type: ActionType.MOUSE_SCROLL, deltaX: (args['deltaX'] as number) ?? 0, deltaY: args['deltaY'] as number, thought: '' } as AgentAction;
        case 'wait':
            return { type: ActionType.WAIT, durationMs: (args['durationMs'] as number) ?? 1000, thought: '' } as AgentAction;
        case 'extract':
            return { type: ActionType.EXTRACT, elementId: args['elementId'] as number, thought: '' } as AgentAction;
        case 'navigate':
            return { type: ActionType.NAVIGATE, url: args['url'] as string, thought: '' } as AgentAction;
        case 'pass':
            return { type: ActionType.PASS, summary: (args['summary'] as string) ?? 'Task completed', thought: '' } as AgentAction;
        case 'fail':
            return { type: ActionType.FAIL, reason: (args['reason'] as string) ?? 'Unknown failure', thought: '' } as AgentAction;
        default:
            return { type: ActionType.FAIL, reason: `Unknown tool: ${name}`, thought: '' } as AgentAction;
    }
}

/**
 * Google ADK implementation of the IAgentRunner port.
 *
 * Encapsulates all @google/adk and @google/genai coupling.
 * Can be swapped for any other agent framework by implementing IAgentRunner.
 */
@injectable()
export class AdkAgentRunner implements IAgentRunner {
    constructor(
        @inject('IPerceptionPipeline') private readonly perception: IPerceptionPipeline,
        @inject('IStorageService') private readonly storage: IStorageService,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(LlmRuntimeConfigResolver) private readonly llmConfigResolver: LlmRuntimeConfigResolver,
    ) {}

    async *executeStep(
        config: StepRunnerConfig,
        browser: IBrowserAutomation,
    ): AsyncGenerator<AgentActionEvent, StepExecutionResult, unknown> {
        const { runId, stepGoal, url, maxActions, vision } = config;

        // Resolve LLM configuration
        const llmConfig = this.llmConfigResolver.resolve();
        if (!llmConfig.apiKey) {
            return {
                success: false,
                terminal: 'error',
                code: 'llm_error',
                reason: 'No API key configured. Set GOOGLE_API_KEY, GEMINI_API_KEY, or DOMIA_LLM_API_KEY.',
            };
        }
        const model = llmConfig.model || 'gemini-2.0-flash';

        // 1. Capture initial page state
        const initialFrame = await this.perception.capture(browser, { vision, aria: true, dom: true });
        if (initialFrame.isErr()) {
            return {
                success: false,
                terminal: 'error',
                code: 'perception_error',
                reason: `Initial perception failed: ${initialFrame.error.message}`,
            };
        }

        const frame = initialFrame.value;
        const viewport = await browser.getViewportSize();

        // Save initial perception assets
        let initialAssets: Record<string, string> = {};
        try {
            initialAssets = await this.storage.savePerceptionAssets(runId, 1, frame);
        } catch {
            this.logger.warn('[AdkAgentRunner] Failed to save initial perception assets');
        }

        // 2. Build initial user message (text + optional screenshot)
        const elementsStr = formatElements(frame.semantic.dom.elements);
        const textPart: Part = {
            text: `GOAL: ${stepGoal}

VIEWPORT: ${viewport.width}x${viewport.height} pixels

CURRENT PAGE:
URL: ${frame.metadata.url || url}
Title: ${frame.metadata.title}

INTERACTIVE ELEMENTS (with bounding boxes [x,y,w,h]):
${elementsStr}

MAX ACTIONS REMAINING: ${maxActions}

Analyze the current page state and begin working toward the goal. Call exactly one tool per turn.`,
        };

        const parts: Part[] = [textPart];

        // Vision: send screenshot as inlineData per ADK/Gemini multimodal spec
        if (vision && frame.vision.primaryScreenshot) {
            parts.push({
                inlineData: {
                    data: frame.vision.primaryScreenshot.toString('base64'),
                    mimeType: frame.vision.mimeType,
                },
            });
        }

        const initialMessage: Content = { role: 'user', parts };

        // 3. Create ADK tools from browser automation
        const tools = createAdkBrowserTools({ browser, perception: this.perception, vision });

        // 4. Create the ADK agent with best-practice configuration
        const actionHistory: string[] = [];

        const agent = new LlmAgent({
            name: 'browser_agent',
            model: new Gemini({ model, apiKey: llmConfig.apiKey }),
            instruction: AGENT_INSTRUCTION,
            tools,
            generateContentConfig: {
                temperature: 0,
            },
            beforeToolCallback: ({ tool, args }) => {
                // Loop detection: track action signatures
                const sig = `${tool.name}:${JSON.stringify(args)}`;
                actionHistory.push(sig);

                if (actionHistory.length >= 3) {
                    const last3 = actionHistory.slice(-3);
                    if (last3.every((s) => s === sig)) {
                        this.logger.warn(`[AdkAgentRunner] Loop detected: ${sig} repeated 3 times`);
                        return {
                            status: 'error',
                            error: `LOOP DETECTED: You have called ${tool.name} with the same arguments 3 times. The page state has not changed. Choose a DIFFERENT action or call 'fail' if the goal cannot be achieved.`,
                        };
                    }
                }
                return undefined;
            },
        });

        // 5. Create runner with session management and budget control
        const sessionService = new InMemorySessionService();
        const runner = new Runner({
            appName: APP_NAME,
            agent,
            sessionService,
        });

        const session = await sessionService.createSession({
            appName: APP_NAME,
            userId: 'domia',
            sessionId: runId,
        });

        // 6. Run the agent — yield actions, handle terminal conditions
        let actionCount = 0;

        try {
            for await (const event of runner.runAsync({
                userId: session.userId,
                sessionId: session.id,
                newMessage: initialMessage,
                runConfig: {
                    // ADK-native budget control: limit total LLM calls
                    maxLlmCalls: maxActions + 2,
                },
            })) {
                const functionCalls = getFunctionCalls(event);

                if (functionCalls?.length) {
                    for (const fc of functionCalls) {
                        const action = mapFunctionCallToAction(fc.name!, fc.args as Record<string, unknown>);
                        actionCount++;

                        this.logger.info(`[AdkAgentRunner] Action ${actionCount}/${maxActions}: ${fc.name}`, fc.args);

                        yield { type: 'action', action, assets: actionCount === 1 ? initialAssets : {} };

                        // Terminal actions
                        if (action.type === ActionType.PASS) {
                            return { success: true, terminal: 'pass' };
                        }
                        if (action.type === ActionType.FAIL) {
                            return {
                                success: false,
                                terminal: 'fail',
                                code: 'agent_fail',
                                reason: (action as { reason: string }).reason,
                            };
                        }

                        // Budget check
                        if (actionCount >= maxActions) {
                            return {
                                success: false,
                                terminal: 'max_actions',
                                code: 'max_actions_reached',
                                reason: `Max actions (${maxActions}) reached for step: ${stepGoal}`,
                            };
                        }
                    }
                }

                // Final text response without a tool call
                if (isFinalResponse(event)) {
                    const text = stringifyContent(event);
                    this.logger.info(`[AdkAgentRunner] Final response: ${text.slice(0, 200)}`);

                    if (actionCount === 0) {
                        return {
                            success: false,
                            terminal: 'fail',
                            code: 'agent_fail',
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
                success: false,
                terminal: 'error',
                code: 'llm_error',
                reason: `ADK agent error: ${message}`,
            };
        }

        return {
            success: false,
            terminal: 'max_actions',
            code: 'max_actions_reached',
            reason: `Agent finished without calling pass/fail. Completed ${actionCount} actions.`,
        };
    }
}
