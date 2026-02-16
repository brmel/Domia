import { injectable } from 'tsyringe';
import { ITraceService, StepTrace } from '@domain/ports/ITraceService';
import { ITraceExporter } from './ITraceExporter';

@injectable()
export class TraceService implements ITraceService {
    private exporters: ITraceExporter[] = [];

    constructor() { }

    addExporter(exporter: ITraceExporter): void {
        if (this.exporters.some(existing => existing.name === exporter.name)) {
            return;
        }
        this.exporters.push(exporter);
    }

    async startTrace(_runId: string): Promise<void> {
    }

    async endTrace(): Promise<void> {
    }

    async tracePerception(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void> {
        await Promise.allSettled(this.exporters.map(e => e.export(runId, stepNumber, data)));
    }

    async traceReasoning(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void> {
        await Promise.allSettled(this.exporters.map(e => e.export(runId, stepNumber, data)));
    }
}
