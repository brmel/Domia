import { container } from 'tsyringe';
import { ActionToolMapper } from '@shared/tooling/ActionToolMapper';
import { GeminiAdapter } from '@infrastructure/adapters/llm/GeminiAdapter';
import { GeminiToolCallingProvider } from '@infrastructure/adapters/llm/GeminiToolCallingProvider';
import { ToolCallingFailurePolicy } from '@infrastructure/adapters/llm/ToolCallingFailurePolicy';
import { LlmRuntimeConfigResolver } from '@infrastructure/adapters/llm/LlmRuntimeConfigResolver';
import { GeminiModelFactory } from '@infrastructure/adapters/llm/GeminiModelFactory';

export function registerLlmModule(): void {
    container.registerSingleton(ActionToolMapper);
    container.registerSingleton(LlmRuntimeConfigResolver);
    container.registerSingleton(GeminiModelFactory);
    container.registerSingleton(ToolCallingFailurePolicy);
    container.register('IToolCallingProvider', { useClass: GeminiToolCallingProvider });
    container.register('ILLMProvider', { useClass: GeminiAdapter });
}
