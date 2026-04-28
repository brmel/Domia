import { inject, injectable } from 'tsyringe';
import type { IRunRepository } from '@domain/ports/IRunRepository';
import type { ILogger } from '@domain/ports';

@injectable()
export class RunRecoveryService {
    constructor(
        @inject('IRunRepository') private readonly runs: IRunRepository,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async markOrphanedRunsAsInterrupted(): Promise<number> {
        const result = await this.runs.getRuns(200);
        if (result.isErr()) {
            this.logger.warn(`[RunRecoveryService] Failed to enumerate runs: ${result.error.message}`);
            return 0;
        }
        const orphaned = result.value.filter((r) => r.status.type === 'running');
        const updates = await Promise.all(
            orphaned.map((run) => this.runs.updateRun(run.id, {
                status: { type: 'interrupted', reason: 'Process restarted while run was active' },
            })),
        );
        const markedCount = updates.filter((u) => u.isOk()).length;
        if (markedCount > 0) {
            this.logger.info(`[RunRecoveryService] Marked ${markedCount} orphaned run(s) as interrupted`);
        }
        return markedCount;
    }
}
