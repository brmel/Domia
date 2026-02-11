
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';

export interface IStorageService {
    savePerceptionAssets(runId: string, stepNumber: number, frame: PerceptionFrame): Promise<Record<string, string>>;
    saveStepTrace(runId: string, stepNumber: number, trace: any): Promise<void>;
    getStepArtifacts(runId: string, stepNumber: number): Promise<{
        screenshots?: string[]; // base64
        dom?: any;
        accessibility?: any;
        trace?: any;
    }>;
}
