import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';
import type { IPerceptionSource } from '@domain/ports/perception/IPerceptionSource';
import { MAX_MUTATION_LOG_ENTRIES, MAX_RECORDING_UNIQUE_VALUES, RECORDING_TIMELINE_ENTRIES } from '@shared/defaults';
import { errorMsg } from '../toolResult';

const INJECT_OBSERVER_SCRIPT = `
(() => {
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

interface LogEntry {
    t: number;
    a: string[];
    r: string[];
}

interface RecordingSummary {
    status: string;
    durationMs: number;
    totalEntries: number;
    allAddedValues: string[];
    allRemovedValues: string[];
    netPresentValues: string[];
    transientValues: string[];
    onlyRemovedValues: string[];
    timeline: Array<{ offsetMs: number; added: string[]; removed: string[] }>;
}

function analyzeLog(log: LogEntry[], durationMs: number): RecordingSummary {
    const addedSet = new Set<string>();
    const removedSet = new Set<string>();

    for (const entry of log) {
        for (const v of entry.a) addedSet.add(v);
        for (const v of entry.r) removedSet.add(v);
    }

    const allAdded = [...addedSet].slice(0, MAX_RECORDING_UNIQUE_VALUES);
    const allRemoved = [...removedSet].slice(0, MAX_RECORDING_UNIQUE_VALUES);

    const netPresent = allAdded.filter(v => !removedSet.has(v));
    const transient = allAdded.filter(v => removedSet.has(v));
    const onlyRemoved = allRemoved.filter(v => !addedSet.has(v));

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

export function createSnapshotRecordingTools(
    perceptionSource: IPerceptionSource,
): ToolSpec[] {
    return ([
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
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'recording' as const }));
}
