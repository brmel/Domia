import { ResultAsync } from 'neverthrow';
import { LLMError } from '../errors';
import { AgentAction, DOMSnapshot } from '../value-objects';

/**
 * Context provided to LLM for action generation
 */
export interface LLMContext {
    readonly goal: string;
    readonly currentUrl: string;
    readonly pageTitle: string;
    readonly snapshot: DOMSnapshot;
    readonly previousActions: readonly AgentAction[];
    readonly stepsRemaining: number;
    readonly viewport: { readonly width: number; readonly height: number };
}

/**
 * ILLMProvider Port
 * Abstracts LLM capabilities for agent reasoning
 */
export interface LLMConfig {
    readonly provider: 'openai' | 'anthropic' | 'google';
    readonly model: string;
    readonly apiKey: string;
}

export interface ILLMProvider {
    readonly providerName: string;
    generateAction(context: LLMContext): ResultAsync<AgentAction, LLMError>;
}
