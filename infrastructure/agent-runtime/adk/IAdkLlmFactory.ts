import type { BaseLlm } from '@google/adk';

export interface AdkLlmFactoryInput {
    readonly model: string;
    readonly apiKey: string | undefined;
}

export interface IAdkLlmFactory {
    create(input: AdkLlmFactoryInput): BaseLlm;
}
