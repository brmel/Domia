import { EventEmitter } from 'events';
import { RunState } from '@domain/enums';

export class ExecutionController extends EventEmitter {
    private _state: RunState = RunState.IDLE;
    private _resumeResolver: (() => void) | null = null;
    private _suspendRequest: { reason: string } | null = null;
    private readonly _children = new Set<ExecutionController>();

    spawnChild(): ExecutionController {
        const child = new ExecutionController();
        this._children.add(child);
        child.start();
        if (this._state === RunState.PAUSED) child.pause();
        return child;
    }

    releaseChild(child: ExecutionController): void {
        this._children.delete(child);
    }

    get state(): RunState {
        return this._state;
    }

    isStopped(): boolean {
        return this._state === RunState.CANCELLED || this._state === RunState.COMPLETED || this._state === RunState.FAILED;
    }

    requestSuspend(reason: string): void {
        this._suspendRequest = { reason };
        this.emit('suspendRequested', reason);
    }

    consumeSuspendRequest(): { reason: string } | null {
        const r = this._suspendRequest;
        this._suspendRequest = null;
        return r;
    }

    hasPendingSuspendRequest(): boolean {
        return this._suspendRequest !== null;
    }

    start(): void {
        this._state = RunState.RUNNING;
        this.emit('stateChanged', this._state);
    }

    pause(): void {
        if (this._state === RunState.RUNNING) {
            this._state = RunState.PAUSED;
            this._children.forEach((child) => child.pause());
            this.emit('stateChanged', this._state);
        }
    }

    resume(): void {
        if (this._state === RunState.PAUSED) {
            this._state = RunState.RUNNING;
            if (this._resumeResolver) {
                this._resumeResolver();
                this._resumeResolver = null;
            }
            this._children.forEach((child) => child.resume());
            this.emit('stateChanged', this._state);
        }
    }

    stop(): void {
        this._state = RunState.CANCELLED;
        if (this._resumeResolver) {
            this._resumeResolver();
            this._resumeResolver = null;
        }
        this._children.forEach((child) => child.stop());
        this.emit('stateChanged', this._state);
    }

    async waitForResume(): Promise<void> {
        if (this._state === RunState.RUNNING) return;
        return new Promise<void>((resolve) => {
            this._resumeResolver = resolve;
        });
    }
}
