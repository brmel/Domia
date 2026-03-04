import type { ToolSpec } from '@infrastructure/tools/ToolSpec';
import type { IPromptService } from '@domain/ports/IPromptService';
import { interpolate } from '@infrastructure/prompts/PromptService';

export function buildAgentInstruction(tools: readonly ToolSpec[], promptService: IPromptService): string {
    const toolNames = tools.map((t) => t.name).join(', ');

    const hasRefTools = tools.some((t) => t.name === 'click');
    const hasMouseTools = tools.some((t) => t.name === 'mouse_click_left');

    let targetingSection = '';
    if (hasRefTools && hasMouseTools) {
        targetingSection = `\nTARGETING:\n${promptService.getPrompt('targetingBoth')}`;
    } else if (hasRefTools) {
        targetingSection = `\nTARGETING:\n${promptService.getPrompt('targetingRefOnly')}`;
    } else if (hasMouseTools) {
        targetingSection = `\nTARGETING:\n${promptService.getPrompt('targetingMouseOnly')}`;
    }

    const template = promptService.getPrompt('systemInstruction');
    return interpolate(template, { toolNames, targetingSection });
}
