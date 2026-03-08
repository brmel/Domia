import type { ReactElement } from 'react';
import { cn } from '../../utils';
import { InfoCard } from '../ui/InfoCard';
import { SectionBlock } from '../ui/SectionBlock';

interface PolicyFlag {
    label: string;
    enabled: boolean;
}

interface PolicyEvent {
    id: string;
    action: string;
    decision: string;
}

interface RunSafetyViewProps {
    isLoading: boolean;
    isError: boolean;
    readinessSummary: string;
    readinessMessage: string | undefined;
    policyFlags: PolicyFlag[];
    recentPolicyEvents: PolicyEvent[];
}

export function RunSafetyView({
    isLoading,
    isError,
    readinessSummary,
    readinessMessage,
    policyFlags,
    recentPolicyEvents,
}: RunSafetyViewProps): ReactElement {
    return (
        <div className="space-y-3">
            {isLoading && (
                <div className="text-xs text-gray-500">Loading readiness report…</div>
            )}
            {isError && (
                <div className="text-xs text-red-600">Could not load readiness report yet.</div>
            )}

            <SectionBlock title="Readiness">
                <InfoCard
                    label="Gate mode"
                    value={readinessSummary}
                    detail={readinessMessage}
                />
            </SectionBlock>

            <SectionBlock title="Policy Flags">
                <div className="grid grid-cols-2 gap-2">
                    {policyFlags.map((flag) => (
                        <div key={flag.label} className="rounded-md border border-gray-200 px-2 py-1.5 bg-gray-50">
                            <div className="text-xs text-gray-600 capitalize">{flag.label}</div>
                            <div className={cn('text-xs font-semibold', flag.enabled ? 'text-green-700' : 'text-gray-500')}>
                                {flag.enabled ? 'Enabled' : 'Disabled'}
                            </div>
                        </div>
                    ))}
                    {policyFlags.length === 0 && (
                        <div className="col-span-2 text-xs text-gray-500">No policy alignment records yet.</div>
                    )}
                </div>
            </SectionBlock>

            <SectionBlock title="Recent Policy View">
                <div className="space-y-1.5">
                    {recentPolicyEvents.map((event) => (
                        <div key={event.id} className="rounded-md border border-gray-200 px-2 py-1.5 bg-gray-50 flex items-center justify-between">
                            <span className="text-xs text-gray-700">{event.action}</span>
                            <span className={cn(
                                'text-xs font-semibold uppercase',
                                event.decision === 'allow' && 'text-green-700',
                                event.decision === 'deny' && 'text-red-700',
                                event.decision === 'observe' && 'text-blue-700',
                            )}>
                                {event.decision}
                            </span>
                        </div>
                    ))}
                    {recentPolicyEvents.length === 0 && (
                        <div className="text-xs text-gray-500">No policy-relevant action events yet.</div>
                    )}
                </div>
            </SectionBlock>
        </div>
    );
}
