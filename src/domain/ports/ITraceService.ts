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
 * Supports multicast exporting to local files, console, and cloud providers.
 */
export interface ITraceService {
    /** Starts a trace for a specific test run. */
    startTrace(runId: string): Promise<void>;

    /** Ends the current trace and flushes any pending exporters. */
    endTrace(): Promise<void>;

    /** Records perceptual data (sensors, DOM state). */
    tracePerception(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;

    /** Records reasoning data (prompts, LLM thoughts, actions). */
    traceReasoning(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
}
