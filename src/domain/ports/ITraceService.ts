import type { AgentAction } from '@domain/value-objects';

export interface StepTrace {
    timestamp: number;
    sensorData?: {
        domCount: number;
        ariaPresent: boolean;
        visionPresent: boolean;
        metadata: Record<string, unknown>;
    };
    agentInput?: {
        goal: string;
        currentUrl: string;
        promptPreview: string; // Truncated for large prompts
        fullPrompt?: unknown; // Only populated in ultra-verbose
    };
    agentOutput?: {
        thought: string;
        action: AgentAction | Record<string, unknown> | null;
        rawResponse: string;
    };
    /** Raw tool call as sent by the model — name + full argument map. */
    toolCall?: {
        name: string;
        input: Record<string, unknown>;
    };
}

export interface ITraceService {
    startTrace(runId: string): Promise<void>;
    endTrace(): Promise<void>;
    tracePerception(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
    traceReasoning(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
}
