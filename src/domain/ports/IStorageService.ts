
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { StepTrace } from './ITraceService';

export interface StepArtifacts {
    screenshots?: string[];
    dom?: Record<string, unknown>;
    accessibility?: string;
    trace?: Record<string, unknown> & Partial<StepTrace>;
    recordings?: string[];
}

export interface IStorageService {
    savePerceptionAssets(runId: string, stepNumber: number, frame: PerceptionFrame): Promise<Record<string, string>>;
    saveStepTrace(runId: string, stepNumber: number, trace: Partial<StepTrace>): Promise<void>;
    getStepArtifacts(runId: string, stepNumber: number): Promise<StepArtifacts>;
    saveActionRecording(runId: string, actionIndex: number, recording: import('../types/ActionRecordingTypes').ActionRecordingData): Promise<void>;
}
