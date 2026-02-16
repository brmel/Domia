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
        timelineSummary?: string;
        timelineFrameCount?: number;
    };
    agentOutput?: {
        thought: string;
        action: AgentAction | Record<string, unknown> | null;
        rawResponse: string;
    };
    temporal?: {
        mode?: 'off' | 'baseline' | 'adaptive' | 'forensic';
        frameCount: number;
        fromTimestamp: number;
        toTimestamp: number;
        summary: string;
        tokenEstimate?: number;
        redactionApplied?: boolean;
    };
}

export interface ITraceService {
    startTrace(runId: string): Promise<void>;
    endTrace(): Promise<void>;
    tracePerception(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
    traceReasoning(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
}
