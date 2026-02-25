import { StepTrace } from './ITraceService';

export interface ITraceExporter {
    name: string;
    export(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void>;
}
