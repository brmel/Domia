export interface StepTrace {
    timestamp: number;
    sensorData?: {
        domCount: number;
        ariaPresent: boolean;
        visionPresent: boolean;
        metadata: any;
    };
    agentInput?: {
        goal: string;
        currentUrl: string;
        promptPreview: string; // Truncated for large prompts
        fullPrompt?: any; // Only populated in ultra-verbose
    };
    agentOutput?: {
        thought: string;
        action: any;
        rawResponse: string;
    };
}

export interface ITraceService {
    startTrace(runId: string): Promise<void>;
    endTrace(): Promise<void>;
    tracePerception(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
    traceReasoning(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
}
