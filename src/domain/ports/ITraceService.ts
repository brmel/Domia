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

/**
 * Port for capturing high-detail execution traces.
 * Designed to be toggled via DOMIA_VERBOSE environment variable.
 */
export interface ITraceService {
    tracePerception(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
    traceReasoning(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
}
