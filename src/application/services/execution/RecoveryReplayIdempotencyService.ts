import { inject, injectable } from 'tsyringe';
import type { IPersistenceAdapter } from '@domain/ports';

@injectable()
export class RecoveryReplayIdempotencyService {
    constructor(@inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter) {}

    async shouldExecute(runId: string, idempotencyKey: string): Promise<boolean> {
        const result = await this.persistence.hasReplayIdempotencyKey(runId, idempotencyKey);
        if (result.isErr()) {
            throw result.error;
        }

        return !result.value;
    }

    async markExecuted(runId: string, idempotencyKey: string): Promise<void> {
        const result = await this.persistence.saveReplayIdempotencyKey(runId, idempotencyKey);
        if (result.isErr()) {
            throw result.error;
        }
    }
}
