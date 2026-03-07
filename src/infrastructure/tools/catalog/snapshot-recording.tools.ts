import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import { MAX_MUTATION_LOG_ENTRIES, MAX_RECORDING_UNIQUE_VALUES, RECORDING_TIMELINE_ENTRIES } from '@shared/defaults';
import { errorMsg } from '../toolResult';

/**
 * JavaScript injected into the page to start the MutationObserver.
 *
 * The observer watches the entire document for:
 *   - childList mutations (nodes added/removed)
 *   - characterData mutations (text content changes)
 *
 * Each mutation batch is flattened into a timestamped log entry with
 * the text of added and removed nodes.  This captures DOM changes at
 * browser speed — even 1 ms intervals — because the observer runs
 * in-page, not via external polling.
 */
const INJECT_OBSERVER_SCRIPT = `
(() => {
    // Prevent double-injection
    if (window.__domia_recording) {
        window.__domia_recording.log = [];
        window.__domia_recording.start = Date.now();
        return { status: 'reset', message: 'Recording was already active — log cleared.' };
    }

    const log = [];
    const start = Date.now();
    const MAX = ${MAX_MUTATION_LOG_ENTRIES};

    function textOf(node) {
        if (node.nodeType === 3) return node.textContent?.trim() || '';
        if (node.nodeType === 1) return node.textContent?.trim() || '';
        return '';
    }

    const observer = new MutationObserver((mutations) => {
        if (log.length >= MAX) return;

        const added = [];
        const removed = [];

        for (const m of mutations) {
            if (m.type === 'childList') {
                for (const n of m.addedNodes)   { const t = textOf(n); if (t) added.push(t); }
                for (const n of m.removedNodes)  { const t = textOf(n); if (t) removed.push(t); }
            }
            if (m.type === 'characterData') {
                const t = m.target.textContent?.trim();
                if (t) added.push(t);
            }
        }

        if (added.length || removed.length) {
            log.push({ t: Date.now() - start, a: added, r: removed });
        }
    });

    observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
    });

    window.__domia_recording = { observer, log, start };
    return { status: 'started' };
})()
`;

/**
 * JavaScript injected into the page to stop the observer and retrieve the log.
 */
const RETRIEVE_AND_STOP_SCRIPT = `
(() => {
    const rec = window.__domia_recording;
    if (!rec) return { status: 'error', error: 'No active recording. Call startRecording first.' };

    rec.observer.disconnect();
    const log = rec.log;
    const durationMs = Date.now() - rec.start;
    delete window.__domia_recording;

    return { status: 'stopped', durationMs, entryCount: log.length, log };
})()
`;


/** @internal — exported for unit tests */
export interface LogEntry {
    t: number;
    a: string[];
    r: string[];
}

/** @internal — exported for unit tests */
export interface RecordingSummary {
    status: string;
    durationMs: number;
    totalEntries: number;
    /** Every unique text value that was added to the DOM during recording. */
    allAddedValues: string[];
    /** Every unique text value that was removed from the DOM during recording. */
    allRemovedValues: string[];
    /** Values that were added but never removed — still on the page. */
    netPresentValues: string[];
    /** Values that were added AND later removed — transient/flashing. */
    transientValues: string[];
    /** Values that were only removed (were already on the page before recording). */
    onlyRemovedValues: string[];
    /**
     * Condensed timeline — first 60 log entries showing the mutation flow.
     * Each entry: { offsetMs, added: string[], removed: string[] }.
     */
    timeline: Array<{ offsetMs: number; added: string[]; removed: string[] }>;
}

/** @internal — exported for unit tests */
export function analyzeLog(log: LogEntry[], durationMs: number): RecordingSummary {
    const addedSet = new Set<string>();
    const removedSet = new Set<string>();

    for (const entry of log) {
        for (const v of entry.a) addedSet.add(v);
        for (const v of entry.r) removedSet.add(v);
    }

    const allAdded = [...addedSet].slice(0, MAX_RECORDING_UNIQUE_VALUES);
    const allRemoved = [...removedSet].slice(0, MAX_RECORDING_UNIQUE_VALUES);

    // Net = added but never removed
    const netPresent = allAdded.filter(v => !removedSet.has(v));
    // Transient = added AND removed (appeared then disappeared)
    const transient = allAdded.filter(v => removedSet.has(v));
    // Only removed = removed but never added (were already on page)
    const onlyRemoved = allRemoved.filter(v => !addedSet.has(v));

    // Condensed timeline — take first N entries
    const timeline = log.slice(0, RECORDING_TIMELINE_ENTRIES).map(e => ({
        offsetMs: e.t,
        added: e.a,
        removed: e.r,
    }));

    return {
        status: 'success',
        durationMs,
        totalEntries: log.length,
        allAddedValues: allAdded,
        allRemovedValues: allRemoved,
        netPresentValues: netPresent,
        transientValues: transient,
        onlyRemovedValues: onlyRemoved,
        timeline,
    };
}


/**
 * Creates the snapshot recording tools.
 *
 * These tools let the agent record and review DOM mutations at browser speed,
 * enabling analysis of transient/fast UIs that change between discrete observe
 * calls.  Works like DevTools Performance recording — the agent decides when
 * to start, the browser captures everything, and the agent reviews the history.
 */
export function createSnapshotRecordingTools(
    perceptionSource: IPerceptionSource,
): ToolSpec[] {
    return [
        {
            name: 'startRecording',
            description:
                'Start recording all DOM text mutations on the current page at browser speed. ' +
                'Once active, every text addition and removal is captured — including changes that last less than 1 ms ' +
                'and would never be visible in a discrete observe snapshot. ' +
                'Call this BEFORE triggering an action whose UI effects you need to verify but that may complete too fast to observe ' +
                '(e.g., rapid counters, progress sequences, transient toasts, flash messages). ' +
                'After the activity finishes, call stopAndReviewRecording to get a structured summary of everything that changed. ' +
                'Input: {} (no parameters). ' +
                'Output: { status: "started" } or { status: "reset", message: string } if already recording.',
            actionType: ActionType.START_RECORDING,
            parameters: z.object({}),
            execute: async () => {
                try {
                    const result = await perceptionSource.evaluateScript(INJECT_OBSERVER_SCRIPT) as Record<string, unknown>;
                    return result;
                } catch (e) {
                    return { status: 'error', error: `Failed to inject recording observer: ${errorMsg(e)}` };
                }
            },
        },
        {
            name: 'stopAndReviewRecording',
            description:
                'Stop the active DOM recording and return a structured analysis of everything that changed ' +
                'since startRecording was called. ' +
                'Returns: allAddedValues (every unique text added), allRemovedValues (every unique text removed), ' +
                'transientValues (added then removed — no longer on the page), netPresentValues (added and still present), ' +
                'onlyRemovedValues (were on the page before recording, now gone), ' +
                'and a condensed timeline of the first 60 mutation events. ' +
                'This is the only way to verify content that appeared and disappeared between observe calls. ' +
                'Input: {}. Output: RecordingSummary or { status: "error", error: string }.',
            actionType: ActionType.STOP_AND_REVIEW_RECORDING,
            parameters: z.object({}),
            execute: async () => {
                try {
                    const raw = await perceptionSource.evaluateScript(RETRIEVE_AND_STOP_SCRIPT) as Record<string, unknown>;
                    if (raw['status'] === 'error') return raw;

                    const log = (raw['log'] as LogEntry[]) ?? [];
                    const durationMs = (raw['durationMs'] as number) ?? 0;

                    return analyzeLog(log, durationMs) as unknown as Record<string, unknown>;
                } catch (e) {
                    return { status: 'error', error: `Failed to retrieve recording: ${errorMsg(e)}` };
                }
            },
        },
    ];
}
