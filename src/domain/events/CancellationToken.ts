/**
 * CancellationToken
 * Cooperative cancellation for async operations
 */
export interface CancellationToken {
    readonly requested: boolean;
}

/**
 * CancellationTokenSource
 * Creates and controls a CancellationToken
 */
export class CancellationTokenSource {
    private _requested = false;

    get token(): CancellationToken {
        return {
            requested: this._requested,
        };
    }

    cancel(): void {
        this._requested = true;
    }

    reset(): void {
        this._requested = false;
    }
}
