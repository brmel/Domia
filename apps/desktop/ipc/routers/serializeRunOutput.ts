import type { RunOutput } from '@backend/dto';

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
