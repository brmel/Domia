import { container } from 'tsyringe';
import { ActionToolMapper } from '@shared/tooling/ActionToolMapper';
import { LangChainAdapter } from '@infrastructure/adapters/llm/LangChainAdapter';
import { LangChainToolCallingProvider } from '@infrastructure/adapters/llm/LangChainToolCallingProvider';
import { ToolCallingFailurePolicy } from '@infrastructure/adapters/llm/ToolCallingFailurePolicy';
import { LlmRuntimeConfigResolver } from '@infrastructure/adapters/llm/LlmRuntimeConfigResolver';
import { LangChainModelFactory } from '@infrastructure/adapters/llm/LangChainModelFactory';

export function registerLlmModule(): void {
    container.registerSingleton(ActionToolMapper);
    container.registerSingleton(LlmRuntimeConfigResolver);
    container.registerSingleton(LangChainModelFactory);
    container.registerSingleton(ToolCallingFailurePolicy);
    container.register('IToolCallingProvider', { useClass: LangChainToolCallingProvider });
    container.register('ILLMProvider', { useClass: LangChainAdapter });
}
