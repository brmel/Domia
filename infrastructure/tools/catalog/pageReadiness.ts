import { z } from 'zod';
import type { PageReadiness, TimeoutOptions } from '@domain/ports';
import { NAVIGATION_TIMEOUT_MS, ELEMENT_WAIT_TIMEOUT_MS } from '@shared/defaults';

export const navigationTimeoutMsParam = z.number().int().min(1).optional()
    .describe(`Max ms to wait for the page to load (default ${NAVIGATION_TIMEOUT_MS}). Raise for slow sites.`);

export const elementTimeoutMsParam = z.number().int().min(1).optional()
    .describe(`Max ms to wait for the element (default ${ELEMENT_WAIT_TIMEOUT_MS}). Raise for slow pages.`);

export const SLOW_PAGE_HINT =
    'Page not fully loaded — content may still appear. Use wait_for_change or waitForCondition, or retry with a higher timeoutMs.';

export function timeoutOption(args: Record<string, unknown>): TimeoutOptions {
    const timeoutMs = args['timeoutMs'] as number | undefined;
    return timeoutMs === undefined ? {} : { timeoutMs };
}

export function readinessFields(readiness: PageReadiness): Record<string, unknown> {
    const fields = {
        loadComplete: readiness.loadComplete,
        networkIdle: readiness.networkIdle,
        waitedMs: readiness.waitedMs,
    };
    return readiness.loadComplete && readiness.networkIdle ? fields : { ...fields, hint: SLOW_PAGE_HINT };
}
