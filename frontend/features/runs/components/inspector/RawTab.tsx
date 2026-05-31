import { CollapsibleSection } from '@frontend/ui/CollapsibleSection';
import { EmptyState } from '@frontend/ui/EmptyState';
import type { StepArtifacts } from '@domain/ports/persistence/IStorageService';
import type { Step } from '@domain/ports/persistence/IRunRepository';
import type { StepTrace } from '@domain/ports/reporting/ITraceService';
import { JsonTreeView } from '../JsonTreeView';
import { SectionLabel } from './inspectorPrimitives';

export function RawTab({ trace, stepDetail, afterArtifacts }: {
    trace: (Record<string, unknown> & Partial<StepTrace>) | undefined;
    stepDetail: Step | undefined;
    afterArtifacts: StepArtifacts;
}): JSX.Element {
    if (!trace && !stepDetail) {
        return <EmptyState icon="{ }" title="No raw data" description="Debug information is not available for this step." />;
    }

    const toolCall = trace?.toolCall;
    const rawResponse = trace?.agentOutput?.rawResponse;
    const assets = stepDetail?.assets;

    return (
        <div className="p-6 space-y-3">
            {toolCall && (
                <CollapsibleSection title="Tool Call" badge={toolCall.name} badgeColor="green" defaultOpen>
                    <div className="grid gap-2">
                        {toolCall.durationMs !== undefined && (
                            <div className="flex items-start gap-3">
                                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded shrink-0 min-w-25">
                                    durationMs
                                </span>
                                <span className="text-sm text-gray-800 break-all font-mono">
                                    {toolCall.durationMs}ms
                                </span>
                            </div>
                        )}
                        {Object.entries(toolCall.input).map(([key, value]) => (
                            <div key={key} className="flex items-start gap-3">
                                <span className="text-xs font-mono bg-green-50 text-green-700 px-2 py-1 rounded shrink-0 min-w-25">
                                    {key}
                                </span>
                                <span className="text-sm text-gray-800 break-all font-mono">
                                    {typeof value === 'string' ? value : JSON.stringify(value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {toolCall?.result && Object.keys(toolCall.result).length > 0 && (
                <CollapsibleSection title="Tool Result" badge={toolCall.name} badgeColor="blue" defaultOpen>
                    <div className="grid gap-2">
                        {Object.entries(toolCall.result).map(([key, value]) => (
                            <div key={key} className="flex items-start gap-3">
                                <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded shrink-0 min-w-25">
                                    {key}
                                </span>
                                <span className="text-sm text-gray-800 break-all font-mono">
                                    {typeof value === 'string' ? value : JSON.stringify(value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </CollapsibleSection>
            )}

            {rawResponse && (
                <CollapsibleSection title="LLM Response" badge="event.content" badgeColor="purple">
                    <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100 max-h-80 overflow-auto">
                        {rawResponse}
                    </pre>
                </CollapsibleSection>
            )}

            {trace?.agentInput && (
                <CollapsibleSection title="Agent Input" badge="context" badgeColor="blue">
                    <div className="grid gap-2 text-sm">
                        <div><span className="font-bold text-gray-500">Goal:</span> {trace.agentInput.goal}</div>
                        <div><span className="font-bold text-gray-500">URL:</span> {trace.agentInput.currentUrl}</div>
                        {trace.agentInput.llmLatencyMs !== undefined && (
                            <div><span className="font-bold text-gray-500">LLM Latency:</span> {trace.agentInput.llmLatencyMs}ms</div>
                        )}
                        {trace.agentInput.promptPreview && (
                            <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap bg-gray-50 rounded p-2 mt-1">
                                {trace.agentInput.promptPreview}
                            </pre>
                        )}
                    </div>
                </CollapsibleSection>
            )}

            {assets && Object.keys(assets).length > 0 && (
                <CollapsibleSection title="Artifacts" badge={`${Object.keys(assets).length} files`} badgeColor="gray" defaultOpen>
                    <div className="space-y-4">
                        {afterArtifacts.screenshots && afterArtifacts.screenshots.length > 0 && (
                            <div>
                                <SectionLabel>Screenshots</SectionLabel>
                                <div className="grid grid-cols-2 gap-3">
                                    {afterArtifacts.screenshots.map((src, i) => (
                                        <img key={i} src={src} alt={`Screenshot ${i + 1}`} className="w-full rounded-lg border border-gray-200 shadow-sm" />
                                    ))}
                                </div>
                            </div>
                        )}
                        {afterArtifacts.dom && (
                            <div>
                                <SectionLabel>DOM Snapshot</SectionLabel>
                                <div className="max-h-60 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
                                    <JsonTreeView data={afterArtifacts.dom} name="DOM" />
                                </div>
                            </div>
                        )}
                        {afterArtifacts.accessibility && (
                            <div>
                                <SectionLabel>Accessibility Tree</SectionLabel>
                                <div className="max-h-60 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
                                    <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{afterArtifacts.accessibility}</pre>
                                </div>
                            </div>
                        )}
                        {afterArtifacts.trace && (
                            <div>
                                <SectionLabel>Trace</SectionLabel>
                                <div className="max-h-60 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
                                    <JsonTreeView data={afterArtifacts.trace} name="Trace" />
                                </div>
                            </div>
                        )}
                    </div>
                </CollapsibleSection>
            )}

            {trace && (
                <CollapsibleSection title="Full Trace JSON" badge="debug" badgeColor="gray">
                    <JsonTreeView data={trace} name="Trace" />
                </CollapsibleSection>
            )}

            {stepDetail && (
                <CollapsibleSection title="Full Action Payload" badge="debug" badgeColor="gray">
                    <JsonTreeView data={stepDetail.actionPayload as unknown as Record<string, unknown>} name="Action" />
                </CollapsibleSection>
            )}
        </div>
    );
}
