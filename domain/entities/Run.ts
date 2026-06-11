import { Result, ok, err } from 'neverthrow';
import { RunStateError } from '../errors';
import { RunId, Url } from '../value-objects';
import { Plan } from './Plan';

export interface Run {
    readonly id: RunId;
    readonly url: Url;
    readonly prompt: string;
    readonly status: RunStatus;
    readonly plan?: Plan;
    readonly parentRunId?: RunId;
    readonly createdAt: Date;
    readonly startedAt?: Date;
    readonly updatedAt: Date;
}

export type RunStatus =
    | { type: 'pending' }
    | { type: 'running' }
    | { type: 'suspended'; reason: string }
    | { type: 'passed'; summary: string; duration: number }
    | { type: 'finished'; summary: string; value?: unknown; duration: number }
    | { type: 'failed'; error: string; duration: number }
    | { type: 'cancelled'; reason: string };

function guard(run: Run, action: string, allowed: readonly RunStatus['type'][]): Result<Run, RunStateError> {
    return allowed.includes(run.status.type)
        ? ok(run)
        : err(new RunStateError(`Cannot ${action} a run in '${run.status.type}' state`));
}

function durationMs(run: Run, now: Date): number {
    return now.getTime() - run.createdAt.getTime();
}

export const Run = {
    create(params: { id: RunId; url: Url; prompt: string; parentRunId?: RunId }, now: Date): Run {
        return {
            id: params.id,
            url: params.url,
            prompt: params.prompt,
            status: { type: 'pending' },
            ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
            createdAt: now,
            updatedAt: now,
        };
    },

    start(run: Run, now: Date): Result<Run, RunStateError> {
        return guard(run, 'start', ['pending']).map((r) => ({
            ...r,
            status: { type: 'running' as const },
            startedAt: now,
            updatedAt: now,
        }));
    },

    pass(run: Run, summary: string, now: Date): Result<Run, RunStateError> {
        return guard(run, 'pass', ['running']).map((r) => ({
            ...r,
            status: { type: 'passed' as const, summary, duration: durationMs(r, now) },
            updatedAt: now,
        }));
    },

    fail(run: Run, error: string, now: Date): Result<Run, RunStateError> {
        return guard(run, 'fail', ['running', 'pending']).map((r) => ({
            ...r,
            status: { type: 'failed' as const, error, duration: durationMs(r, now) },
            updatedAt: now,
        }));
    },

    finish(run: Run, summary: string, now: Date, value?: unknown): Result<Run, RunStateError> {
        return guard(run, 'finish', ['running']).map((r) => ({
            ...r,
            status: {
                type: 'finished' as const,
                summary,
                ...(value !== undefined ? { value } : {}),
                duration: durationMs(r, now),
            },
            updatedAt: now,
        }));
    },

    suspend(run: Run, reason: string, now: Date): Result<Run, RunStateError> {
        return guard(run, 'suspend', ['running']).map((r) => ({
            ...r,
            status: { type: 'suspended' as const, reason },
            updatedAt: now,
        }));
    },

    resume(run: Run, now: Date): Result<Run, RunStateError> {
        return guard(run, 'resume', ['suspended']).map((r) => ({
            ...r,
            status: { type: 'running' as const },
            updatedAt: now,
        }));
    },
};
