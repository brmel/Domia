import type { LLMContext } from '@domain/ports';
import { ActionType } from '@domain/enums/ActionType';
import type { LLMEvaluationContext } from '@domain/ports';

export const ACTION_SYSTEM_PROMPT = `You are an autonomous web testing agent. You interact with web pages to verify conditions and achieve goals.

Role boundary:
- You are the ACTOR stage.
- Do not re-plan the whole task unless evaluation context indicates reformulation is required.
- Choose exactly one best next action tool call from current state.
    
CAPABILITIES:
- You can click, type, pressKey, scroll, wait, extract data, and use coordinate mouse controls.
- You receive bounding box coordinates for every element.
- You receive the viewport dimensions to calculate positions.

TOOLS:
- Use the runtime-provided AVAILABLE TOOLS list in the user context.
- Only call tools that are present in AVAILABLE TOOLS.

LAYOUT ANALYSIS:
To check if an element is horizontally centered:
  - Element center: elementX + (elementWidth / 2)
  - Page center: viewportWidth / 2
  - Centered if: |elementCenter - pageCenter| < 50 pixels

RULES:
1. Analyze elements and their positions before deciding.
2. Use element IDs from the snapshot to target elements.
3. Action types must be lowercase: "click", "type", "pass", "fail", etc.
4. To pass, return action: { "type": "pass", "summary": "Goal achieved" }
5. To fail, return action: { "type": "fail", "reason": "Cannot proceed because..." }
6. The CURRENT PAGE URL is always provided below. Never fail because URL is missing.
7. Use navigate only when a page change is truly required; do not navigate to empty or relative URLs. If navigating, use a full http/https URL.
8. Do not fail on the first uncertainty. Re-check state and try one alternative action when feasible before returning fail.
9. Avoid repeating scroll when the page state is unchanged; after a few no-progress attempts, choose a different action or fail with a clear reason.
10. Do not call pass as your first model action for a step. Perform at least one concrete verification action first and only pass when you can cite clear evidence.
11. When the goal requires validating a list/value (e.g., supported languages), use extract on concrete UI elements and base the decision on extracted content, not assumptions.

Respond by calling exactly one tool.`;

export const EVALUATION_SYSTEM_PROMPT = `You are the evaluator stage of a browser testing agent.

Role boundary:
- You are the EVALUATOR stage.
- Do not propose concrete click/type tool actions.
- Judge outcome quality and provide retry/reformulate guidance only.

You DO NOT execute tools. You only decide one of:
- sub_task_success: the current step objective is satisfied.
- need_retry: keep the same objective, retry with a concrete short advice.
- need_reformulate: current objective is blocked/invalid, reformulate with a concise reason and advice.

Rules:
1. Prefer evidence-based outcomes from current snapshot, URL/title, and latest attempted action.
2. If execution failed due to transient interaction issues, usually choose need_retry.
3. If step objective is impossible or contradicted by page state, choose need_reformulate.
4. Keep summary/advice concise and actionable.
5. Provide a confidence score between 0 and 1.
6. Provide concrete evidence strings that justify the decision.

Required evaluator tool arguments:
- summary: short justification
- confidence: number between 0 and 1
- evidence: array of one or more concise evidence statements
- advice: required for need_retry, optional for need_reformulate

Respond by calling exactly one evaluator tool.`;

export function buildActionUserPrompt(context: LLMContext): string {
    const elementsStr = context.snapshot.elements
        .slice(0, 50)
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

    const formatAttributes = (attrs: Record<string, string>): string =>
        Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ') || 'None';

    const previousActionsStr = context.previousActions
        .slice(-5)
        .map((a, i) => {
            const desc = ('elementDescriptor' in a && a.elementDescriptor) ? ` on ${a.elementDescriptor}` : '';
            if (a.type === ActionType.PRESS_KEY) return `${i + 1}. pressKey(${a.key})`;
            if (a.type === ActionType.NAVIGATE) return `${i + 1}. navigate to ${a.url}`;
            return `${i + 1}. ${a.type}${desc}`;
        })
        .join('\n');

    const formatPlan = (p: unknown): string => {
        const plan = p as { items: { status: string; description: string; contract?: { objective?: string } }[] };
        if (!plan || !plan.items) return 'No active plan.';
        return plan.items
            .map((item) => {
                const objective = item.contract?.objective?.trim();
                const summary = objective && objective.length > 0 ? objective : item.description;
                return `- [${item.status.toUpperCase()}] ${summary}`;
            })
            .join('\n');
    };

    const availableTools = (context.availableTools ?? [])
        .map(tool => {
            const category = tool.category ? ` (${tool.category})` : '';
            const safety = tool.safety ? ` [${tool.safety}]` : '';
            const sideEffects = tool.sideEffects && tool.sideEffects.length > 0
                ? ` effects=${tool.sideEffects.join('|')}`
                : '';
            const terminal = tool.terminal ? ' terminal=true' : '';
            return `- ${tool.name}${category}: ${tool.description}${safety}${sideEffects}${terminal}`;
        })
        .join('\n');

    const temporalWindowStr = context.temporalWindow
        ? [
            `Modeled window: ${context.temporalWindow.fromTimestamp} -> ${context.temporalWindow.toTimestamp}`,
            `Frames: ${context.temporalWindow.frames.length}`,
            `Summary: ${context.temporalWindow.summary}`,
            ...context.temporalWindow.frames.slice(-5).map((frame, index) =>
                `  ${index + 1}. t=${frame.timestamp} interval=${frame.intervalMs} domHash=${frame.domHash ?? 'n/a'} note=${frame.note ?? 'none'}`
            )
        ].join('\n')
        : 'Not available.';

    return `GOAL: ${context.goal}

VIEWPORT: ${context.viewport.width}x${context.viewport.height} pixels

CURRENT PAGE:
URL: ${context.currentUrl}
Title: ${context.pageTitle}

ROOT ELEMENTS:
- <html> attributes: ${formatAttributes(context.snapshot.rootElements.html)}
- <body> attributes: ${formatAttributes(context.snapshot.rootElements.body)}

INTERACTIVE ELEMENTS (with bounding boxes [x,y,w,h]):
${elementsStr}

PREVIOUS ACTIONS:
${previousActionsStr || 'None yet'}

CURRENT PLAN:
${formatPlan(context.plan)}

AVAILABLE TOOLS:
${availableTools || 'Use the default core actions (click, type, pressKey, scroll, mouse_move, mouse_click_left, mouse_click_right, mouse_double_click, mouse_drag, mouse_scroll, wait, extract, navigate, pass, fail).'}

TEMPORAL TIMELINE:
${temporalWindowStr}

STEPS REMAINING: ${context.stepsRemaining}

ADVICE FROM EVALUATOR:
${context.advice ?? 'None'}

Analyze the elements and their positions, then respond by calling exactly one tool:`;
}

export function buildEvaluationUserPrompt(context: LLMEvaluationContext): string {
    const attemptedAction = JSON.stringify(context.attemptedAction);
    const previousActions = context.previousActions
        .slice(-6)
        .map((a, index) => `${index + 1}. ${a.type}`)
        .join('\n');

    return `STEP GOAL: ${context.goal}

CURRENT PAGE:
URL: ${context.currentUrl}
Title: ${context.pageTitle}

ATTEMPTED ACTION:
${attemptedAction}

EXECUTION OUTCOME: ${context.executionOutcome}
EXECUTION ERROR: ${context.executionError ?? 'None'}
EXECUTION OBSERVATION: ${context.executionObservation ?? 'None'}

PREVIOUS ACTIONS:
${previousActions || 'None'}

CURRENT EVALUATOR ADVICE CONTEXT:
${context.advice ?? 'None'}

KEY ELEMENTS COUNT: ${context.snapshot.elements.length}
STEPS REMAINING: ${context.stepsRemaining}

Decide by calling exactly one evaluator tool.`;
}
