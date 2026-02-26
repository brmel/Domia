import type { ReactElement } from 'react';

interface CheckpointRecord {
    id: string;
    reason: string;
    detail: string;
}

interface RunCheckpointsViewProps {
    isLoading: boolean;
    isError: boolean;
    checkpointRecords: CheckpointRecord[];
}

export function RunCheckpointsView({ isLoading, isError, checkpointRecords }: RunCheckpointsViewProps): ReactElement {
    return (
        <div className="space-y-2">
            {isLoading && (
                <div className="text-xs text-gray-500">Loading persisted checkpoints…</div>
            )}
            {isError && (
                <div className="text-xs text-red-600">Could not load persisted checkpoints. Showing local summary.</div>
            )}
            {checkpointRecords.map((checkpoint) => (
                <div key={checkpoint.id} className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{checkpoint.reason}</div>
                    <div className="mt-1 text-xs text-gray-600">{checkpoint.detail}</div>
                </div>
            ))}
            {checkpointRecords.length === 0 && (
                <div className="text-xs text-gray-500">No checkpoint events yet.</div>
            )}
        </div>
    );
}
