import { injectable } from 'tsyringe';

interface LaneQueue {
    locked: boolean;
    waiters: Array<() => void>;
}

export interface RunExecutionLaneService {
    acquire(laneKey: string): Promise<() => void>;
}

@injectable()
export class InMemoryRunExecutionLaneService implements RunExecutionLaneService {
    private readonly lanes = new Map<string, LaneQueue>();

    async acquire(laneKey: string): Promise<() => void> {
        const key = laneKey.trim();
        const queue = this.lanes.get(key) ?? { locked: false, waiters: [] };
        this.lanes.set(key, queue);

        if (queue.locked) {
            await new Promise<void>((resolve) => {
                queue.waiters.push(resolve);
            });
        }

        queue.locked = true;

        let released = false;
        return () => {
            if (released) {
                return;
            }

            released = true;

            const next = queue.waiters.shift();
            if (next) {
                next();
                return;
            }

            queue.locked = false;
            this.lanes.delete(key);
        };
    }
}
