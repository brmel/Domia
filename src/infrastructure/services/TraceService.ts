import { injectable } from 'tsyringe';
import { ITraceService, StepTrace } from '@domain/ports/ITraceService';
import { ITraceExporter } from './ITraceExporter';

@injectable()
export class TraceService implements ITraceService {
    private exporters: ITraceExporter[] = [];

    constructor() { }

    /** Adds an exporter to the composite. */
    addExporter(exporter: ITraceExporter): void {
        this.exporters.push(exporter);
    }

    async startTrace(_runId: string): Promise<void> {
        // Lifecycle hook for exporters if needed
    }

    async endTrace(): Promise<void> {
        // Lifecycle hook for exporters if needed
    }

    async tracePerception(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void> {
        await Promise.all(this.exporters.map(e => e.export(runId, stepNumber, data)));
    }

    async traceReasoning(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void> {
        await Promise.all(this.exporters.map(e => e.export(runId, stepNumber, data)));
    }
}
