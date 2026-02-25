import { EventEmitter } from 'events';
import { RunState } from '../../domain/enums/RunState';
import type { AgentAction } from '../../domain/value-objects';

export class ExecutionController extends EventEmitter {
    private _state: RunState = RunState.IDLE;
    private _resumeResolver: (() => void) | null = null;
    private _pendingActionOverride: AgentAction | null = null;

    get state(): RunState {
        return this._state;
    }

    isStopped(): boolean {
        return this._state === RunState.CANCELLED || this._state === RunState.COMPLETED || this._state === RunState.FAILED;
    }

    start(): void {
        this._state = RunState.RUNNING;
        this.emit('stateChanged', this._state);
    }

    pause(): void {
        if (this._state === RunState.RUNNING) {
            this._state = RunState.PAUSED;
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
            this.emit('stateChanged', this._state);
        }
    }

    stop(): void {
        this._state = RunState.CANCELLED;
        this._pendingActionOverride = null;
        if (this._resumeResolver) {
            this._resumeResolver();
            this._resumeResolver = null;
        }
        this.emit('stateChanged', this._state);
    }

    queueActionOverride(action: AgentAction): void {
        this._pendingActionOverride = action;
        this.emit('actionOverrideQueued', action);
    }

    consumeActionOverride(): AgentAction | undefined {
        if (!this._pendingActionOverride) {
            return undefined;
        }

        const next = this._pendingActionOverride;
        this._pendingActionOverride = null;
        return next;
    }

    async waitForResume(): Promise<void> {
        if (this._state === RunState.RUNNING) return;
        return new Promise<void>((resolve) => {
            this._resumeResolver = resolve;
        });
    }
}
