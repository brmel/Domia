import { injectable } from 'tsyringe';
import type { ITraceService } from '@domain/ports/ITraceService';

@injectable()
export class TraceService implements ITraceService {
    async startTrace(_runId: string): Promise<void> {}
    async endTrace(): Promise<void> {}
}
