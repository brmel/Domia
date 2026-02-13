
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { TimelineContextWindow } from '@domain/value-objects/TemporalObservation';

export interface IStorageService {
    savePerceptionAssets(runId: string, stepNumber: number, frame: PerceptionFrame): Promise<Record<string, string>>;
    saveTemporalWindow(runId: string, stepNumber: number, temporalWindow: TimelineContextWindow): Promise<Record<string, string>>;
    saveStepTrace(runId: string, stepNumber: number, trace: any): Promise<void>;
    getStepArtifacts(runId: string, stepNumber: number): Promise<{
        screenshots?: string[]; // base64
        dom?: any;
        accessibility?: any;
        trace?: any;
        temporalWindow?: TimelineContextWindow;
    }>;
}
