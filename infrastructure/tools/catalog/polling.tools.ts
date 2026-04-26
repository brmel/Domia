import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';
import type { PostActionCaptureMiddleware } from '../PostActionCaptureMiddleware';
import {
    MAX_POLL_DURATION_MS,
    MIN_POLL_INTERVAL_MS,
    MAX_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_POLL_TIMEOUT_MS,
    POLL_TIMEOUT_SNAPSHOT_CHARS,
} from '@shared/defaults';

export function createPollingTools(
    captureMiddleware: PostActionCaptureMiddleware,
): ToolSpec[] {
    return [
        {
            name: 'waitForCondition',
            description:
                'Poll the page repeatedly until a text pattern appears in the ARIA snapshot, or a timeout is reached. ' +
                'Counts as a single action regardless of how many polls it takes. ' +
                'Prefer this over manual observe-wait-observe loops whenever you need to wait for the page to reach a specific state — ' +
                'it is more efficient and avoids burning your action budget. ' +
                'Typical situations: waiting for a background process to finish, a status to change, a counter to complete, ' +
                'a loading indicator to disappear, or a confirmation message to appear. ' +
                'Input: { pattern: string, isRegex?: boolean, timeoutMs?: number (default 30 000, max 600 000), pollIntervalMs?: number (default 2 000) }. ' +
                'Output: { status: "matched", matchedText: string, elapsedMs: number, polls: number } or ' +
                '{ status: "timeout", elapsedMs: number, polls: number, lastSnapshot: string (first 500 chars) }.',
            actionType: ActionType.WAIT_FOR_CONDITION,
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
                    `Max milliseconds to poll before giving up. Default ${DEFAULT_POLL_TIMEOUT_MS}, max ${MAX_POLL_DURATION_MS}.`
                ),
                pollIntervalMs: z.number().int().min(MIN_POLL_INTERVAL_MS).max(MAX_POLL_INTERVAL_MS).optional().describe(
                    `Milliseconds between each poll. Default ${DEFAULT_POLL_INTERVAL_MS}.`
                ),
            }),
            execute: async (args) => {
                const pattern = args['pattern'] as string;
                const isRegex = (args['isRegex'] as boolean | undefined) ?? false;
                const timeoutMs = Math.min(
                    (args['timeoutMs'] as number | undefined) ?? DEFAULT_POLL_TIMEOUT_MS,
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

                    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
                }

                return {
                    status: 'timeout',
                    elapsedMs: Date.now() - startMs,
                    polls,
                    lastSnapshot: lastSnapshot.slice(0, POLL_TIMEOUT_SNAPSHOT_CHARS),
                };
            },
        } satisfies ToolSpec,
    ];
}
