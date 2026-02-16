import { inject, injectable } from 'tsyringe';
import type { IPersistenceAdapter } from '@domain/ports';

export interface NodeReplayIdempotencyScope {
    readonly runId: string;
    readonly branchId: string;
    readonly nodeId: string;
    readonly actionSignature: string;
}

@injectable()
export class RecoveryReplayIdempotencyService {
    constructor(@inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter) {}

    buildNodeReplayKey(scope: NodeReplayIdempotencyScope): string {
        return `${scope.runId}:${scope.branchId}:${scope.nodeId}:${scope.actionSignature}`;
    }

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
