import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ToolCallingFailurePolicy } from '@infrastructure/adapters/llm/ToolCallingFailurePolicy';

describe('ToolCallingFailurePolicy', () => {
    it('retries recoverable retryable no_tool_call failures', () => {
        const policy = new ToolCallingFailurePolicy();

        const action = policy.resolve(
            {
                code: 'no_tool_call',
                message: 'Model did not return any tool call.',
                recoverable: true,
                retryable: true
            },
            1,
            3
        );

        expect(action.type).toBe('retry');
    });

    it('requests retry_with_correction for invalid tool args', () => {
        const policy = new ToolCallingFailurePolicy();

        const action = policy.resolve(
            {
                code: 'invalid_tool_args',
                message: 'Schema validation failed',
                recoverable: true,
                retryable: true
            },
            1,
            3
        );

        expect(action.type).toBe('retry_with_correction');
    });

    it('fails immediately for non-recoverable model capability failures', () => {
        const policy = new ToolCallingFailurePolicy();

        const action = policy.resolve(
            {
                code: 'model_no_tool_support',
                message: 'Selected model does not support tool calling.',
                recoverable: false,
                retryable: false
            },
            1,
            3
        );

        expect(action.type).toBe('fail');
    });

    it('fails when retry budget is exhausted', () => {
        const policy = new ToolCallingFailurePolicy();

        const action = policy.resolve(
            {
                code: 'provider_transient',
                message: 'Timeout',
                recoverable: true,
                retryable: true
            },
            3,
            3
        );

        expect(action.type).toBe('fail');
    });
});
