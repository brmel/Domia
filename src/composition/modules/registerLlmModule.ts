import { container } from 'tsyringe';
import { LlmRuntimeConfigResolver } from '@infrastructure/adapters/llm/LlmRuntimeConfigResolver';
import { AdkAgentRunner } from '@infrastructure/adapters/adk/AdkAgentRunner';

export function registerLlmModule(): void {
    container.registerSingleton(LlmRuntimeConfigResolver);
    container.registerSingleton('IAgentRunner', AdkAgentRunner);
}
