import type { RunOutput } from '../../src/application/dtos';

/**
 * Converts Error instances in RunOutput events to plain objects
 * so they survive JSON serialization over tRPC IPC.
 *
 * Error objects serialize to `{}` via JSON.stringify, losing their
 * `message`, `name`, and `code` properties. This function converts
 * them to plain objects before they cross the IPC boundary.
 */
export function serializeRunOutput(event: RunOutput): RunOutput {
    if (event.type === 'error' && event.error instanceof Error) {
        return {
            type: 'error',
            error: {
                name: event.error.name,
                message: event.error.message,
                code: 'code' in event.error ? (event.error as { code: string }).code : 'UNKNOWN',
            } as unknown as Error,
        };
    }
    return event;
}
