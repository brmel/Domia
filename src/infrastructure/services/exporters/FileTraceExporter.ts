import { StepTrace } from '@domain/ports/ITraceService';
import { ITraceExporter } from '@domain/ports/ITraceExporter';
import { IStorageService } from '@domain/ports/IStorageService';

export class FileTraceExporter implements ITraceExporter {
    public readonly name = 'FileTraceExporter';

    constructor(private storage: IStorageService) { }

    async export(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void> {
        await this.storage.saveStepTrace(runId, stepNumber, data);
    }
}
