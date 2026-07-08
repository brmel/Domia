import type { BaseLlm } from '@google/adk';
import type { LlmAuth } from '@infrastructure/llm/LlmRuntimeConfigResolver';

export interface AdkLlmFactoryInput {
    readonly model: string;
    readonly auth: LlmAuth;
}

export interface IAdkLlmFactory {
    create(input: AdkLlmFactoryInput): BaseLlm;
}
