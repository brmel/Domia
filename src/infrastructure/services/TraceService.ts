import { injectable, inject } from 'tsyringe';
import { ITraceService, StepTrace } from '@domain/ports/ITraceService';
import type { IStorageService } from '@domain/ports/IStorageService';

@injectable()
export class TraceService implements ITraceService {
    private isVerbose: boolean;

    constructor(
        @inject('IStorageService') private storage: IStorageService
    ) {
        this.isVerbose = process.env['DOMIA_VERBOSE'] === 'true';
    }

    async tracePerception(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void> {
        if (!this.isVerbose) return;
        await this.storage.saveStepTrace(runId, stepNumber, data);
    }

    async traceReasoning(runId: string, stepNumber: number, data: Partial<StepTrace>): Promise<void> {
        if (!this.isVerbose) return;

        // Sanitize sensitive data from trace if needed
        const sanitized = { ...data };
        if (sanitized.agentInput?.fullPrompt) {
            // Logic to truncate or redact if it exceeds certain limits
        }

        await this.storage.saveStepTrace(runId, stepNumber, sanitized);
    }
}
