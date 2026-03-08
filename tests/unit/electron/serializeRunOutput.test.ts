import { describe, it, expect } from 'vitest';
import { serializeRunOutput } from '../../../electron/routers/serializeRunOutput';
import { WorkflowError } from '../../../src/domain/errors';
import type { RunOutput } from '../../../src/application/dtos';

describe('serializeRunOutput', () => {
    it('converts Error instances to plain serializable objects', () => {
        const event: RunOutput = {
            type: 'error',
            error: new Error('Session creation failed'),
        };

        const serialized = serializeRunOutput(event);

        expect(serialized.type).toBe('error');
        const error = (serialized as { error: { name: string; message: string; code: string } }).error;
        expect(error.message).toBe('Session creation failed');
        expect(error.name).toBe('Error');
        expect(error.code).toBe('UNKNOWN');

        // Verify it survives JSON round-trip
        const parsed = JSON.parse(JSON.stringify(serialized));
        expect(parsed.error.message).toBe('Session creation failed');
    });

    it('preserves code property from WorkflowError', () => {
        const workflowError = new WorkflowError('Budget exceeded');
        (workflowError as unknown as { code: string }).code = 'BUDGET_EXCEEDED';

        const event: RunOutput = { type: 'error', error: workflowError };
        const serialized = serializeRunOutput(event);

        const error = (serialized as { error: { code: string } }).error;
        expect(error.code).toBe('BUDGET_EXCEEDED');
    });

    it('passes through non-error events unchanged', () => {
        const event: RunOutput = { type: 'completed', success: true, summary: 'Done' };
        const result = serializeRunOutput(event);
        expect(result).toBe(event); // same reference
    });

    it('passes through already-serialized error events', () => {
        const event: RunOutput = {
            type: 'error',
            error: { name: 'Error', message: 'already plain', code: 'UNKNOWN' } as unknown as Error,
        };
        // Not an instanceof Error, so should pass through
        const result = serializeRunOutput(event);
        expect(result).toBe(event);
    });

    it('demonstrates the original JSON serialization problem', () => {
        const original: RunOutput = { type: 'error', error: new Error('lost message') };

        // Without serialization: Error becomes {}
        const broken = JSON.parse(JSON.stringify(original));
        expect(broken.error.message).toBeUndefined();

        // With serialization: message is preserved
        const fixed = JSON.parse(JSON.stringify(serializeRunOutput(original)));
        expect(fixed.error.message).toBe('lost message');
    });
});
