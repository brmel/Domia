
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { StepTrace } from './ITraceService';

export interface StepArtifacts {
    screenshots?: string[];
    dom?: Record<string, unknown>;
    accessibility?: Record<string, unknown>;
    trace?: Record<string, unknown> & Partial<StepTrace>;
}

export interface IStorageService {
    savePerceptionAssets(runId: string, stepNumber: number, frame: PerceptionFrame): Promise<Record<string, string>>;
    saveStepTrace(runId: string, stepNumber: number, trace: Partial<StepTrace>): Promise<void>;
    getStepArtifacts(runId: string, stepNumber: number): Promise<StepArtifacts>;
}
