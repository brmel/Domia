import { EventEmitter } from 'events';
import { TestRunState } from '../../domain/enums/TestRunState';
import { IExecutionController } from '../../domain/ports/IExecutionController';
import type { AgentAction } from '../../domain/value-objects';

export class ExecutionController extends EventEmitter implements IExecutionController {
    private _state: TestRunState = TestRunState.IDLE;
    private _resumeResolver: (() => void) | null = null;
    private _inputResolver: ((input: string) => void) | null = null;
    private _currentPrompt: string | undefined;
    private _pendingActionOverride: AgentAction | null = null;

    get state(): TestRunState {
        return this._state;
    }

    isStopped(): boolean {
        return this._state === TestRunState.CANCELLED || this._state === TestRunState.COMPLETED || this._state === TestRunState.FAILED;
    }

    get currentPrompt(): string | undefined {
        return this._currentPrompt;
    }

    start(): void {
        this._state = TestRunState.RUNNING;
        this.emit('stateChanged', this._state);
    }

    pause(): void {
        if (this._state === TestRunState.RUNNING) {
            this._state = TestRunState.PAUSED;
            this.emit('stateChanged', this._state);
        }
    }

    resume(): void {
        if (this._state === TestRunState.PAUSED) {
            this._state = TestRunState.RUNNING;
            if (this._resumeResolver) {
                this._resumeResolver();
                this._resumeResolver = null;
            }
            this.emit('stateChanged', this._state);
        }
    }

    stop(): void {
        this._state = TestRunState.CANCELLED;
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

    requestInput(prompt?: string): void {
        this._state = TestRunState.AWAITING_INPUT;
        this._currentPrompt = prompt;
        this.emit('stateChanged', this._state, prompt);
    }

    provideInput(input: string): void {
        if (this._state === TestRunState.AWAITING_INPUT) {
            this._state = TestRunState.RUNNING;
            if (this._inputResolver) {
                this._inputResolver(input);
                this._inputResolver = null;
            }
            this.emit('stateChanged', this._state);
        }
    }

    async waitForResume(): Promise<void> {
        if (this._state === TestRunState.RUNNING) return;
        return new Promise<void>((resolve) => {
            this._resumeResolver = resolve;
        });
    }

    async waitForInput(): Promise<string> {
        return new Promise<string>((resolve) => {
            this._inputResolver = resolve;
        });
    }
}
