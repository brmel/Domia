import type { ToolSpec } from '@infrastructure/tools/ToolSpec';
import type { IPromptService } from '@domain/ports/IPromptService';
import { interpolate } from '@infrastructure/prompts/interpolate';

export function buildAgentInstruction(tools: readonly ToolSpec[], promptService: IPromptService): string {
    const toolNames = tools.map((t) => t.name).join(', ');

    const hasInteractionTools = tools.some((t) => t.category === 'interaction');
    const hasMouseTools = tools.some((t) => t.category === 'mouse');
    const hasShellTools = tools.some((t) => t.category === 'shell');

    const targetingKey = hasInteractionTools && hasMouseTools ? 'targetingBoth'
        : hasInteractionTools ? 'targetingRefOnly'
        : hasMouseTools ? 'targetingMouseOnly'
        : null;
    const targetingSection = targetingKey
        ? `\nTARGETING:\n${promptService.getPrompt(targetingKey)}`
        : '';

    const shellSection = hasShellTools
        ? `\n- ${promptService.getPrompt('shellCapabilityNote')}`
        : '';

    const shellExecRule = promptService.getPrompt(
        hasShellTools ? 'shellAvailableRule' : 'shellUnavailableRule',
    );

    const template = promptService.getPrompt('systemInstruction');
    return interpolate(template, { toolNames, targetingSection, shellSection, shellExecRule });
}
