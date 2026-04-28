import { injectable } from 'tsyringe';
import AsyncLock from 'async-lock';

export interface RunExecutionLaneService {
    acquire(laneKey: string): Promise<() => void>;
}

@injectable()
export class InMemoryRunExecutionLaneService implements RunExecutionLaneService {
    private readonly lock = new AsyncLock();

    async acquire(laneKey: string): Promise<() => void> {
        let releaseFn!: () => void;
        const releasePromise = new Promise<void>(resolve => { releaseFn = resolve; });

        await new Promise<void>(resolve => {
            this.lock.acquire(laneKey.trim(), () => {
                resolve();
                return releasePromise;
            });
        });

        return releaseFn;
    }
}
