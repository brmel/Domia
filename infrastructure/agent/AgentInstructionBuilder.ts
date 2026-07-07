import type { ToolSpec } from '@infrastructure/tools/ToolSpec';
import type { IPromptRenderer } from '@domain/ports/agent/IPromptService';
import { PromptKey } from '@domain/ports/agent/IPromptService';
import { ToolCategory } from '@domain/types/ToolTypes';

export function buildAgentInstruction(tools: readonly ToolSpec[], promptService: IPromptRenderer): string {
    const toolNames = tools.map((t) => t.name).join(', ');

    const hasInteractionTools = tools.some((t) => t.category === ToolCategory.Interaction);
    const hasMouseTools = tools.some((t) => t.category === ToolCategory.Mouse);
    const hasShellTools = tools.some((t) => t.category === ToolCategory.Shell);

    const targetingKey = hasInteractionTools && hasMouseTools ? PromptKey.TargetingBoth
        : hasInteractionTools ? PromptKey.TargetingRefOnly
        : hasMouseTools ? PromptKey.TargetingMouseOnly
        : null;
    const targetingSection = targetingKey
        ? `\nTARGETING:\n${promptService.getPrompt(targetingKey)}`
        : '';

    const shellSection = hasShellTools
        ? `\n- ${promptService.getPrompt(PromptKey.ShellCapabilityNote)}`
        : '';

    const shellExecRule = promptService.getPrompt(
        hasShellTools ? PromptKey.ShellAvailableRule : PromptKey.ShellUnavailableRule,
    );

    return promptService.renderPrompt(PromptKey.SystemInstruction, {
        toolNames, targetingSection, shellSection, shellExecRule,
    });
}
