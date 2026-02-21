import { LlmAgent, Gemini, Runner, InMemorySessionService, getFunctionCalls, isFinalResponse, stringifyContent } from '@google/adk';
import type { Content } from '@google/genai';
import type { IBrowserAutomation, IPerceptionPipeline, ILogger } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import type { StepExecutionResult } from '@application/services/execution/StepExecutor';
import { createAdkBrowserTools } from './AdkBrowserToolFactory';
import type { DOMElement } from '@domain/value-objects/DOMSnapshot';

const APP_NAME = 'domia';

const ADK_AGENT_INSTRUCTION = `You are an autonomous web testing agent. You interact with web pages to verify conditions and achieve goals.

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

export interface AdkStepRunnerConfig {
    readonly runId: string;
    readonly stepGoal: string;
    readonly browser: IBrowserAutomation;
    readonly perception: IPerceptionPipeline;
    readonly url: string;
    readonly apiKey: string;
    readonly model: string;
    readonly maxActions: number;
    readonly vision: boolean;
    readonly logger: ILogger;
    readonly saveAssets: (stepNumber: number, frame: import('@domain/value-objects/PerceptionFrame').PerceptionFrame) => Promise<Record<string, string>>;
}

function formatElements(elements: readonly DOMElement[], limit = 50): string {
    return elements
        .slice(0, limit)
        .map((el) => {
            const attrs = Object.entries(el.attributes)
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ');
            const bbox = el.boundingBox
                ? `[x:${Math.round(el.boundingBox.x)},y:${Math.round(el.boundingBox.y)},w:${Math.round(el.boundingBox.width)},h:${Math.round(el.boundingBox.height)}]`
                : '';
            return `[${el.id}] <${el.tag} ${attrs}>${el.text.slice(0, 50)}</${el.tag}> ${bbox}`;
        })
        .join('\n');
}

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

export class AdkStepRunner {
    private readonly config: AdkStepRunnerConfig;

    constructor(config: AdkStepRunnerConfig) {
        this.config = config;
    }

    async *run(): AsyncGenerator<
        { type: 'action'; action: AgentAction; assets?: Record<string, string> },
        StepExecutionResult,
        unknown
    > {
        const { runId, stepGoal, browser, perception, url, apiKey, model, maxActions, vision, logger, saveAssets } = this.config;

        // 1. Capture initial DOM state
        const initialFrame = await perception.capture(browser, { vision, aria: true, dom: true });
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
            initialAssets = await saveAssets(1, frame);
        } catch {
            logger.warn('[AdkStepRunner] Failed to save initial perception assets');
        }

        const elementsStr = formatElements(frame.semantic.dom.elements);

        const initialMessage: Content = {
            role: 'user',
            parts: [{
                text: `GOAL: ${stepGoal}

VIEWPORT: ${viewport.width}x${viewport.height} pixels

CURRENT PAGE:
URL: ${frame.metadata.url || url}
Title: ${frame.metadata.title}

INTERACTIVE ELEMENTS (with bounding boxes [x,y,w,h]):
${elementsStr}

MAX ACTIONS REMAINING: ${maxActions}

Analyze the current page state and begin working toward the goal. Call exactly one tool per turn.`,
            }],
        };

        // 2. Create ADK tools from browser automation
        const tools = createAdkBrowserTools({ browser, perception });

        // 3. Create the ADK agent
        const geminiModel = new Gemini({ model, apiKey });

        const actionHistory: string[] = [];
        const agent = new LlmAgent({
            name: 'browser_agent',
            model: geminiModel,
            instruction: ADK_AGENT_INSTRUCTION,
            tools,
            beforeToolCallback: ({ tool, args }) => {
                // Loop detection: track action signatures
                const sig = `${tool.name}:${JSON.stringify(args)}`;
                actionHistory.push(sig);

                // Check for 3+ identical consecutive actions
                if (actionHistory.length >= 3) {
                    const last3 = actionHistory.slice(-3);
                    if (last3.every(s => s === sig)) {
                        logger.warn(`[AdkStepRunner] Loop detected: ${sig} repeated 3 times`);
                        return {
                            status: 'error',
                            error: `LOOP DETECTED: You have called ${tool.name} with the same arguments 3 times. The page state has not changed. Choose a DIFFERENT action or call 'fail' if the goal cannot be achieved.`,
                        };
                    }
                }
                return undefined;
            },
        });

        // 4. Create runner with session management
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

        // 5. Run the agent and yield actions
        let actionCount = 0;

        try {
            for await (const event of runner.runAsync({
                userId: session.userId,
                sessionId: session.id,
                newMessage: initialMessage,
            })) {
                const functionCalls = getFunctionCalls(event);

                if (functionCalls?.length) {
                    for (const fc of functionCalls) {
                        const action = mapFunctionCallToAction(fc.name!, fc.args as Record<string, unknown>);
                        actionCount++;

                        logger.info(`[AdkStepRunner] Action ${actionCount}/${maxActions}: ${fc.name}`, fc.args);

                        yield { type: 'action', action, assets: actionCount === 1 ? initialAssets : {} };

                        // Terminal actions: pass or fail
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

                // If the model generates a final text response without a tool call
                if (isFinalResponse(event)) {
                    const text = stringifyContent(event);
                    logger.info(`[AdkStepRunner] Final response from agent: ${text.slice(0, 200)}`);

                    // If the model just gave text without calling pass/fail, treat as incomplete
                    if (actionCount === 0) {
                        return {
                            success: false,
                            terminal: 'fail',
                            code: 'agent_fail',
                            reason: 'Agent generated text without calling any tools',
                        };
                    }
                    // Model finished naturally after executing actions
                    break;
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`[AdkStepRunner] Agent error: ${message}`);
            return {
                success: false,
                terminal: 'error',
                code: 'llm_error',
                reason: `ADK agent error: ${message}`,
            };
        }

        // If we get here, the loop ended without a terminal action
        return {
            success: false,
            terminal: 'max_actions',
            code: 'max_actions_reached',
            reason: `Agent finished without calling pass/fail. Completed ${actionCount} actions.`,
        };
    }
}
