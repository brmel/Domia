import { z } from 'zod';
import type { IStructuredAutomation } from '@domain/ports';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import { ActionType } from '@domain/enums';
import { ObservationProfile } from '@domain/value-objects';
import type { ToolSpec } from '../ToolSpec';
import type { PostActionCaptureMiddleware } from '../PostActionCaptureMiddleware';
import { MAX_EXTRACT_TEXT_LENGTH, MAX_PAGE_CONTENT_LENGTH, DEFAULT_WAIT_DURATION_MS } from '@shared/defaults';
import { WEB_ELECTRON_PLATFORMS, unwrapResult, toolError, toolSuccess } from '../toolResult';
import type { IObservationCoordinator } from '@domain/ports/IObservationCoordinator';

export function createObservationTools(
    automation: IStructuredAutomation,
    captureMiddleware: PostActionCaptureMiddleware,
    perceptionSource?: IPerceptionSource,
    observation?: IObservationCoordinator,
): ToolSpec[] {
    return ([
        {
            name: 'observe',
            description: 'Capture current page state (ARIA snapshot with refs + optional screenshot) without any interaction. Use to refresh your view after an action. Input: { delayMs?: number (default 0), vision?: boolean }. Output: { status: "success", currentUrl, pageTitle, elementCount, elements } or { status: "error", error: string }.',
            actionType: ActionType.OBSERVE,
            parameters: z.object({
                delayMs: z.number().int().nonnegative().optional().describe('Ms to wait before capturing. Use for animations/transitions. Default 0.'),
                vision: z.boolean().optional().describe('Skip screenshots for this capture when set to false. Only effective when vision is enabled for the session.'),
            }),
            execute: async (args) => captureMiddleware.capture(
                args['delayMs'] as number | undefined,
                args['vision'] as boolean | undefined,
            ),
        },
        {
            name: 'extract',
            description: `Extract the visible text content of an element for assertion or verification. Returns up to ${MAX_EXTRACT_TEXT_LENGTH} characters of whitespace-normalized text. Input: { ref: string }. Output: { status: "success", extractedText: string, fullLength: number, truncated: boolean } or { status: "error", error: string }.`,
            actionType: ActionType.EXTRACT,
            platforms: WEB_ELECTRON_PLATFORMS,
            parameters: z.object({
                ref: z.string().describe('Element ref from the ARIA snapshot (e.g. "e3").'),
            }),
            execute: async (args) => {
                const result = await automation.extractText(args['ref'] as string);
                if (result.isErr()) return toolError(result.error.message);
                const normalized = result.value.replace(/\s+/g, ' ').trim();
                const truncated = normalized.length > MAX_EXTRACT_TEXT_LENGTH;
                const text = truncated ? normalized.slice(0, MAX_EXTRACT_TEXT_LENGTH) : normalized;
                return toolSuccess({
                    extractedText: text || '(empty)',
                    fullLength: normalized.length,
                    truncated,
                });
            },
        },
        {
            name: 'extract_page_content',
            description: `Extract the full visible text content of the entire page (body innerText). Use when you need to read large amounts of page content at once — articles, data tables, lists — instead of extracting individual elements one by one. Returns up to ${MAX_PAGE_CONTENT_LENGTH} characters. Input: { selector?: string (CSS selector, default "body") }. Output: { status: "success", content: string, length: number, truncated: boolean } or { status: "error", error: string }.`,
            actionType: ActionType.EXTRACT,
            platforms: WEB_ELECTRON_PLATFORMS,
            parameters: z.object({
                selector: z.string().optional().describe('CSS selector for the root element to extract from. Default "body". Use "main", "article", etc. for targeted extraction.'),
            }),
            execute: async (args) => {
                if (!perceptionSource) return toolError('Perception source not available');
                try {
                    const selector = (args['selector'] as string) || 'body';
                    const raw = await perceptionSource.evaluateScript(
                        ((sel: unknown) => {
                            const el = document.querySelector(sel as string);
                            return el ? (el as HTMLElement).innerText : '';
                        }) as (...args: unknown[]) => string,
                        selector,
                    ) as string;
                    const text = (raw ?? '').replace(/\n{3,}/g, '\n\n').trim();
                    const truncated = text.length > MAX_PAGE_CONTENT_LENGTH;
                    const content = truncated ? text.slice(0, MAX_PAGE_CONTENT_LENGTH) : text;
                    return toolSuccess({ content: content || '(empty)', length: text.length, truncated });
                } catch (e) {
                    return toolError(`Page content extraction failed: ${e instanceof Error ? e.message : String(e)}`);
                }
            },
        },
        {
            name: 'recall_recent',
            description:
                'Read the live observation buffer for events that happened in the last N milliseconds without performing any new action. ' +
                'Useful when something flashed on screen between your tool calls (console errors, network failures, fast DOM mutations). ' +
                'Input: { sinceMs?: number (default 5000) }. ' +
                'Output: { status: "success", frames: Array<{ source, summary, capturedAt, attachmentSummaries }>, count: number }.',
            actionType: ActionType.RECALL_RECENT,
            parameters: z.object({
                sinceMs: z.number().int().min(100).max(600_000).optional().describe('Window size in ms; default 5000.'),
            }),
            execute: async (args) => {
                if (!observation) return toolError('recall_recent requires an active observation coordinator');
                const sinceMs = (args['sinceMs'] as number | undefined) ?? 5000;
                const frames = observation.recent(sinceMs).map((f) => ({
                    source: f.source,
                    summary: f.summary,
                    capturedAt: f.capturedAt,
                    attachmentSummaries: f.attachments.map((a) => ({ id: a.id, contentType: a.contentType, bytes: a.bytes })),
                }));
                return toolSuccess({ frames, count: frames.length });
            },
        },
        {
            name: 'wait',
            description: 'Pause execution for a specified duration. Use to let animations, transitions, AJAX calls, or debounced UI updates complete. Input: { durationMs?: number (default 1000) }. Output: { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.WAIT,
            parameters: z.object({
                durationMs: z.number().optional().describe('Milliseconds to pause. Default 1000.'),
            }),
            execute: async (args) => {
                const ms = typeof args['durationMs'] === 'number' ? (args['durationMs'] as number) : DEFAULT_WAIT_DURATION_MS;
                return unwrapResult(await automation.wait(ms));
            },
        },
        ...(observation ? [{
            name: 'set_observation_profile' as const,
            description:
                'Switch the observation profile for the rest of the run. Use to control how often the platform samples the target between your actions: ' +
                '"off" (no sampling), "on-demand" (only when you call observe), "long-wait" (slow periodic snapshots — best for hour-long waits), ' +
                '"quick-action" (fast streaming — best for capturing transient UI events between calls), "high-fidelity" (maximum sampling rate). ' +
                'You can switch profiles freely. Input: { profile: "off" | "on-demand" | "long-wait" | "quick-action" | "high-fidelity" }. ' +
                'Output: { status: "success", profile, previous } or { status: "error" }.',
            actionType: ActionType.SET_OBSERVATION_PROFILE,
            parameters: z.object({
                profile: z.enum(['off', 'on-demand', 'long-wait', 'quick-action', 'high-fidelity'])
                    .describe('Target observation profile.'),
            }),
            execute: async (args: Record<string, unknown>) => {
                const target = args['profile'] as ObservationProfile;
                const previous = observation.currentProfile();
                if (target === previous) return toolSuccess({ profile: target, previous });
                await observation.setProfile(target);
                return toolSuccess({ profile: target, previous });
            },
        }] : []),
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'observation' as const }));
}
