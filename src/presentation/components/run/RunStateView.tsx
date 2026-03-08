import type { ReactElement } from 'react';
import type { AgentAction } from '@domain/value-objects';
import { InfoCard } from '../ui/InfoCard';

interface RunStateViewProps {
    status: string;
    history: AgentAction[];
    currentAction: AgentAction | null;
    summary: string | null;
    errorMessage: string | null;
}

export function RunStateView({
    status,
    history,
    currentAction,
    summary,
    errorMessage,
}: RunStateViewProps): ReactElement {
    return (
        <div className="space-y-3 text-xs">
            <InfoCard label="Run Status" value={status} />
            <InfoCard label="History Length" value={`${history.length} action(s)`} />
            <InfoCard label="Current Action" value={currentAction?.type ?? 'None'} />
            <InfoCard
                label="Terminal Summary"
                value={<span className="font-normal text-gray-800 line-clamp-4 whitespace-pre-wrap">{summary || errorMessage || 'Not available yet'}</span>}
            />
        </div>
    );
}
