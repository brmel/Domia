import { getThought } from '@frontend/lib/actionUtils';
import { EmptyState } from '@frontend/ui/EmptyState';
import type { Step } from '@domain/ports/IRunRepository';
import { SectionBar } from './inspectorPrimitives';

export function SummaryTab({ stepDetail, beforeScreenshot }: {
    stepDetail: Step | undefined;
    beforeScreenshot: string | undefined;
}): JSX.Element {
    if (!stepDetail) {
        return <EmptyState icon="⚡" title="No action data" description="Action details are not available for this step." />;
    }

    const { actionType, actionPayload, timestamp } = stepDetail;
    const thought = getThought(actionPayload);

    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(actionPayload)) {
        if (key !== 'type' && key !== 'thought') {
            params[key] = value;
        }
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start gap-5">
                <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 uppercase tracking-wider">
                            ⚡ {actionType}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">{new Date(timestamp).toLocaleString()}</span>
                    </div>

                    {thought && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Agent Reasoning</div>
                            <p className="text-gray-800 text-sm leading-relaxed italic">"{thought}"</p>
                        </div>
                    )}
                </div>

                {beforeScreenshot && (
                    <div className="shrink-0">
                        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 text-center">Before</div>
                        <img
                            src={beforeScreenshot}
                            alt="Page state before action"
                            className="w-40 h-24 rounded-lg border border-gray-200 object-cover shadow-sm"
                        />
                    </div>
                )}
            </div>

            {Object.keys(params).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <SectionBar>Parameters</SectionBar>
                    <div className="p-4">
                        <div className="grid gap-3">
                            {Object.entries(params).map(([key, value]) => (
                                <div key={key} className="flex items-start gap-3">
                                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded shrink-0 min-w-25">
                                        {key}
                                    </span>
                                    <span className="text-sm text-gray-800 break-all">
                                        {typeof value === 'string' ? value : JSON.stringify(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
