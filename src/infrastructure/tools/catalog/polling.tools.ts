import { z } from 'zod';
import { ActionType } from '@domain/enums/ActionType';
import type { ToolSpec } from '../ToolSpec';
import type { PostActionCaptureMiddleware } from '../PostActionCaptureMiddleware';

/**
 * Maximum total polling duration (5 minutes).
 * Prevents a single waitForCondition call from consuming
 * the entire run budget.
 */
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

/**
 * Sensible bounds for the poll interval.
 */
const MIN_POLL_INTERVAL_MS = 200;
const MAX_POLL_INTERVAL_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Creates the polling tool catalog.
 *
 * `waitForCondition` is a long-running tool that repeatedly captures the page
 * state and checks whether a user-specified text/regex pattern appears in the
 * ARIA snapshot.  It counts as **one action** in the budget, letting the agent
 * wait for slow back-end processes, animations, or toasts without burning
 * multiple observe→wait→observe cycles.
 */
export function createPollingTools(
    captureMiddleware: PostActionCaptureMiddleware,
): ToolSpec[] {
    return [
        {
            name: 'waitForCondition',
            description:
                'Poll the page until a text pattern appears in the ARIA snapshot or a timeout is reached. ' +
                'This is a LONG-RUNNING operation that counts as a single action — do NOT call it again while it is pending. ' +
                'Use it when the system under test performs a slow operation (file upload, server job, payment processing, etc.) ' +
                'and you need to wait for a specific UI indicator before continuing. ' +
                'Input: { pattern: string, isRegex?: boolean, timeoutMs?: number (default 30 000, max 300 000), pollIntervalMs?: number (default 2 000) }. ' +
                'Output: { status: "matched", matchedText: string, elapsedMs: number, polls: number } or ' +
                '{ status: "timeout", elapsedMs: number, polls: number, lastSnapshot: string (first 500 chars) }.',
            actionType: ActionType.WAIT_FOR_CONDITION,
            // isLongRunning flag — picked up by AdkToolFactory to wrap as LongRunningFunctionTool
            isLongRunning: true,
            parameters: z.object({
                pattern: z.string().describe(
                    'Text or regex pattern to search for in the ARIA snapshot. ' +
                    'Examples: "Upload complete", "Order #\\\\d+", "✓ Saved".'
                ),
                isRegex: z.boolean().optional().describe(
                    'If true, treat `pattern` as a JavaScript regex (case-insensitive). Default false (plain text includes-check).'
                ),
                timeoutMs: z.number().int().min(1000).max(MAX_POLL_DURATION_MS).optional().describe(
                    `Max milliseconds to poll before giving up. Default ${DEFAULT_TIMEOUT_MS}, max ${MAX_POLL_DURATION_MS}.`
                ),
                pollIntervalMs: z.number().int().min(MIN_POLL_INTERVAL_MS).max(MAX_POLL_INTERVAL_MS).optional().describe(
                    `Milliseconds between each poll. Default ${DEFAULT_POLL_INTERVAL_MS}.`
                ),
            }),
            execute: async (args) => {
                const pattern = args['pattern'] as string;
                const isRegex = (args['isRegex'] as boolean | undefined) ?? false;
                const timeoutMs = Math.min(
                    (args['timeoutMs'] as number | undefined) ?? DEFAULT_TIMEOUT_MS,
                    MAX_POLL_DURATION_MS,
                );
                const pollIntervalMs = Math.max(
                    MIN_POLL_INTERVAL_MS,
                    Math.min(
                        (args['pollIntervalMs'] as number | undefined) ?? DEFAULT_POLL_INTERVAL_MS,
                        MAX_POLL_INTERVAL_MS,
                    ),
                );

                let regex: RegExp | null = null;
                if (isRegex) {
                    try {
                        regex = new RegExp(pattern, 'i');
                    } catch {
                        return { status: 'error', error: `Invalid regex pattern: ${pattern}` };
                    }
                }

                const startMs = Date.now();
                let polls = 0;
                let lastSnapshot = '';

                while (Date.now() - startMs < timeoutMs) {
                    polls++;

                    // Capture current page state via the same middleware used by `observe`
                    const captureResult = await captureMiddleware.capture();
                    if (typeof captureResult['status'] === 'string' && captureResult['status'] === 'error') {
                        return { status: 'error', error: captureResult['error'] as string, polls, elapsedMs: Date.now() - startMs };
                    }

                    const snapshot = (captureResult['elements'] as string) ?? '';
                    lastSnapshot = snapshot;

                    const matched = regex
                        ? regex.test(snapshot)
                        : snapshot.toLowerCase().includes(pattern.toLowerCase());

                    if (matched) {
                        const matchedText = regex
                            ? (snapshot.match(regex)?.[0] ?? pattern)
                            : pattern;
                        return {
                            status: 'matched',
                            matchedText,
                            elapsedMs: Date.now() - startMs,
                            polls,
                        };
                    }

                    // Wait before next poll
                    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
                }

                return {
                    status: 'timeout',
                    elapsedMs: Date.now() - startMs,
                    polls,
                    lastSnapshot: lastSnapshot.slice(0, 500),
                };
            },
        } as ToolSpec & { isLongRunning?: boolean },
    ];
}
