import type { ReactElement } from 'react';
import { RunState } from '@domain/enums/RunState';
import type { AgentAction } from '@domain/value-objects';
import type { RecoveryReplayTelemetry } from '@application/dtos';
import { InfoCard } from '../ui/InfoCard';
import { SectionBlock } from '../ui/SectionBlock';
import { Button } from '../ui/Button';

interface RunStateViewProps {
    status: RunState;
    history: AgentAction[];
    currentAction: AgentAction | null;
    recoveryReplay: RecoveryReplayTelemetry | null;
    summary: string | null;
    errorMessage: string | null;
    actionOverrideJson: string;
    setActionOverrideJson: (value: string) => void;
    actionOverrideError: string | null;
    setActionOverrideError: (value: string | null) => void;
    overrideIsPending: boolean;
    onQueueOverride: () => void;
}

export function RunStateView({
    status,
    history,
    currentAction,
    recoveryReplay,
    summary,
    errorMessage,
    actionOverrideJson,
    setActionOverrideJson,
    actionOverrideError,
    setActionOverrideError,
    overrideIsPending,
    onQueueOverride,
}: RunStateViewProps): ReactElement {
    return (
        <div className="space-y-3 text-xs">
            <InfoCard label="Run Status" value={status} />
            <InfoCard label="History Length" value={`${history.length} action(s)`} />
            <InfoCard label="Current Action" value={currentAction?.type ?? 'None'} />
            <InfoCard
                label="Recovery Replay"
                value={recoveryReplay
                    ? `${recoveryReplay.status} (${recoveryReplay.replayedCount}/${recoveryReplay.targetStepNumber})`
                    : 'Not active'}
                detail={recoveryReplay?.reason}
            />
            <InfoCard
                label="Terminal Summary"
                value={<span className="font-normal text-gray-800 line-clamp-4 whitespace-pre-wrap">{summary || errorMessage || 'Not available yet'}</span>}
            />

            <SectionBlock title="Operator Action Override">
                <div className="space-y-2">
                    <textarea
                        value={actionOverrideJson}
                        onChange={(event) => {
                            setActionOverrideJson(event.target.value);
                            if (actionOverrideError) {
                                setActionOverrideError(null);
                            }
                        }}
                        placeholder='{"type":"mouse_click_left","x":120,"y":240,"thought":"Operator override"}'
                        className="w-full min-h-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-mono"
                        disabled={status !== RunState.RUNNING || overrideIsPending}
                    />
                    {actionOverrideError ? (
                        <p className="text-[11px] text-red-600">{actionOverrideError}</p>
                    ) : (
                        <p className="text-[11px] text-gray-500">Queue one validated action to override the next model-generated action.</p>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onQueueOverride}
                        disabled={status !== RunState.RUNNING || overrideIsPending || actionOverrideJson.trim().length === 0}
                    >
                        {overrideIsPending ? 'Queueing…' : 'Queue Override Action'}
                    </Button>
                </div>
            </SectionBlock>
        </div>
    );
}
