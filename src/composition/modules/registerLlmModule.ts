import { container } from 'tsyringe';
import { LlmRuntimeConfigResolver } from '@infrastructure/adapters/llm/LlmRuntimeConfigResolver';

export function registerLlmModule(): void {
    container.registerSingleton(LlmRuntimeConfigResolver);
}
