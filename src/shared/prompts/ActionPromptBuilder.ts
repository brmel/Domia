import type { LLMContext } from '@domain/ports';
import { ActionType } from '@domain/enums/ActionType';

export const ACTION_SYSTEM_PROMPT = `You are an autonomous web testing agent. You interact with web pages to verify conditions and achieve goals.
    
CAPABILITIES:
- You can click, type, pressKey, scroll, wait, and extract data.
- You receive bounding box coordinates for every element.
- You receive the viewport dimensions to calculate positions.

TOOLS:
- click
- type
- pressKey
- scroll
- wait
- extract
- navigate
- pass
- fail

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

Respond by calling exactly one tool.`;

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
        const plan = p as { items: { status: string; description: string }[] };
        if (!plan || !plan.items) return 'No active plan.';
        return plan.items.map(item => `- [${item.status.toUpperCase()}] ${item.description}`).join('\n');
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
${availableTools || 'Use the default core actions (click, type, pressKey, scroll, wait, extract, navigate, pass, fail).'}

STEPS REMAINING: ${context.stepsRemaining}

Analyze the elements and their positions, then respond by calling exactly one tool:`;
}
