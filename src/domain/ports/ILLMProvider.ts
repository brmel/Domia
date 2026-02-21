import { ResultAsync } from 'neverthrow';
import { LLMError } from '../errors';
import { AgentAction, DOMSnapshot, LLMEvaluationDecision } from '../value-objects';

export interface LLMToolDescriptor {
    readonly name: string;
    readonly description: string;
    readonly category?: string | undefined;
    readonly platforms?: readonly string[] | undefined;
    readonly terminal?: boolean | undefined;
    readonly safety?: 'safe' | 'caution' | 'restricted' | undefined;
    readonly sideEffects?: readonly ('none' | 'ui' | 'filesystem' | 'network' | 'system')[] | undefined;
}

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
    readonly plan?: import('../entities/Plan').Plan;
    readonly availableTools?: readonly LLMToolDescriptor[];
    readonly advice?: string;
}

export interface LLMEvaluationContext extends LLMContext {
    readonly attemptedAction: AgentAction;
    readonly executionOutcome: 'executed' | 'execution_error' | 'not_executed';
    readonly executionError?: string;
    readonly executionObservation?: string;
}

/**
 * ILLMProvider Port
 * Abstracts LLM capabilities for agent reasoning
 */
export interface LLMConfig {
    readonly provider: 'google';
    readonly model: string;
    readonly apiKey?: string;
    readonly baseUrl?: string;
}

export interface ILLMProvider {
    readonly providerName: string;
    generateAction(context: LLMContext): ResultAsync<AgentAction, LLMError>;
    generateEvaluation(context: LLMEvaluationContext): ResultAsync<LLMEvaluationDecision, LLMError>;
    generatePlan(prompt: string): ResultAsync<import('../entities/Plan').Plan, LLMError>;
}
