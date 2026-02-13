import React from 'react';
import { cn } from '../../lib/utils';
import type { RecoveryReplayTelemetry, ReplanningTelemetry } from '@application/dtos';

interface RunTimelineViewProps {
    statusLabel: string;
    actionTypes: string[];
    checkpoints: Array<{ id: string; reason: string; detail: string }>;
    recoveryReplay: RecoveryReplayTelemetry | null;
    replanningEvents: ReplanningTelemetry[];
}

type TimelineLane = 'lifecycle' | 'action' | 'checkpoint' | 'recovery' | 'policy';

interface TimelineEvent {
    id: string;
    lane: TimelineLane;
    title: string;
    detail: string;
}

export function RunTimelineView({
    statusLabel,
    actionTypes,
    checkpoints,
    recoveryReplay,
    replanningEvents
}: RunTimelineViewProps): React.ReactElement {
    const events: TimelineEvent[] = [];

    events.push({
        id: 'lifecycle-status',
        lane: 'lifecycle',
        title: 'Run Status',
        detail: statusLabel
    });

    actionTypes.forEach((actionType, index) => {
        events.push({
            id: `action-${index + 1}`,
            lane: 'action',
            title: `Action #${index + 1}`,
            detail: actionType
        });
    });

    checkpoints.forEach((checkpoint) => {
        events.push({
            id: `checkpoint-${checkpoint.id}`,
            lane: 'checkpoint',
            title: checkpoint.reason,
            detail: checkpoint.detail
        });
    });

    if (recoveryReplay) {
        events.push({
            id: 'recovery-replay',
            lane: 'recovery',
            title: `Recovery replay: ${recoveryReplay.status}`,
            detail: `replayed ${recoveryReplay.replayedCount}/${recoveryReplay.targetStepNumber}${recoveryReplay.reason ? ` · ${recoveryReplay.reason}` : ''}`
        });
    }

    replanningEvents.forEach((event, index) => {
        events.push({
            id: `replanning-${index}`,
            lane: 'policy',
            title: `Replanning ${event.status}`,
            detail: `${event.trigger ?? 'no-trigger'} · ${event.reason}`
        });
    });

    return (
        <div className="space-y-2">
            {events.map((event, index) => (
                <div key={`${event.id}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                        <span className={cn('text-[11px] font-semibold uppercase tracking-wide', laneClass(event.lane))}>
                            {event.lane}
                        </span>
                        <span className="text-[11px] text-gray-500">#{index + 1}</span>
                    </div>
                    <div className="mt-1 text-xs font-medium text-gray-800">{event.title}</div>
                    <div className="mt-0.5 text-xs text-gray-600">{event.detail}</div>
                </div>
            ))}
            {events.length === 0 && (
                <div className="text-xs text-gray-500">No timeline events yet.</div>
            )}
        </div>
    );
}

function laneClass(lane: TimelineLane): string {
    switch (lane) {
        case 'lifecycle':
            return 'text-blue-700';
        case 'action':
            return 'text-gray-700';
        case 'checkpoint':
            return 'text-indigo-700';
        case 'recovery':
            return 'text-amber-700';
        case 'policy':
            return 'text-purple-700';
        default: {
            const exhaustiveCheck: never = lane;
            return exhaustiveCheck;
        }
    }
}
