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
        promptPreview: string;
        llmLatencyMs?: number;
    };
    agentOutput?: {
        thought: string;
        action: AgentAction | Record<string, unknown> | null;
        rawResponse: string;
    };
    toolCall?: {
        name: string;
        input: Record<string, unknown>;
        result?: Record<string, unknown>;
        durationMs?: number;
    };
}

export interface ITraceService {
    startTrace(runId: string): Promise<void>;
    endTrace(): Promise<void>;
    tracePerception(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
    traceReasoning(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
}
