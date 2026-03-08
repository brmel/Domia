import { useRef, useState, useCallback } from 'react';
import { useStepInspectorStore } from '../../stores/useStepInspectorStore';
import { trpc } from '../../trpc';
import { getThought } from '../../utils/actionUtils';
import { JsonTreeView } from './JsonTreeView';
import { cn } from '../../utils';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { EmptyState } from '../ui/EmptyState';
import { SegmentedControl } from '../ui/SegmentedControl';
import type { StepArtifacts } from '@domain/ports/IStorageService';
import type { Step } from '@domain/ports/IPersistenceAdapter';
import type { StepTrace } from '@domain/ports/ITraceService';

const QUERY_OPTS = { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } as const;

function TabPanel({ id, activeTab, overflow = true, children }: { id: string; activeTab: string; overflow?: boolean; children: React.ReactNode }) {
    return (
        <div className={cn("absolute inset-0 transition-opacity duration-300", overflow && "overflow-auto",
            activeTab === id ? "opacity-100 z-10" : "opacity-0 pointer-events-none")}>
            {children}
        </div>
    );
}

function SectionBar({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={cn("px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider", className)}>{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{children}</div>;
}

export function StepInspector(): JSX.Element | null {
    const { isOpen, runId, stepNumber, close } = useStepInspectorStore();
    const modalRef = useRef<HTMLDivElement>(null);

    const enabled = isOpen && !!runId && stepNumber !== null;

    const artifactsQuery = trpc.history.getStepArtifacts.useQuery(
        { runId: runId!, stepNumber: stepNumber! },
        { enabled, ...QUERY_OPTS }
    );

    const prevArtifactsQuery = trpc.history.getStepArtifacts.useQuery(
        { runId: runId!, stepNumber: Math.max((stepNumber ?? 1) - 1, 0) },
        { enabled: enabled && (stepNumber ?? 0) > 1, ...QUERY_OPTS }
    );

    const stepDetailQuery = trpc.history.getStepDetail.useQuery(
        { runId: runId!, stepNumber: stepNumber! },
        { enabled, ...QUERY_OPTS }
    );

    const anyLoading = artifactsQuery.isLoading || stepDetailQuery.isLoading;
    const anyError = artifactsQuery.error ?? stepDetailQuery.error;

    const handleRetry = useCallback(() => {
        void artifactsQuery.refetch();
        void prevArtifactsQuery.refetch();
        void stepDetailQuery.refetch();
    }, [artifactsQuery, prevArtifactsQuery, stepDetailQuery]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={close}
            />

            <div
                ref={modalRef}
                className="relative w-full max-w-6xl h-[85vh] bg-white rounded-xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm">
                            {stepNumber}
                        </div>
                        <div>
                            <h2 className="text-gray-900 font-semibold text-sm">Step Inspection</h2>
                            <p className="text-gray-500 text-xs font-mono">{runId?.slice(0, 8)}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRetry}
                            className="text-xs text-gray-500 hover:text-gray-700"
                            title="Reload artifacts"
                        >
                            ↻
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={close}
                            className="rounded-full p-2"
                        >
                            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden bg-gray-50/50 relative">
                    {anyLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                            <span className="text-gray-500 font-medium text-sm animate-pulse">Retrieving artifacts...</span>
                        </div>
                    )}

                    {!anyLoading && anyError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
                                <span className="text-2xl">⚠️</span>
                            </div>
                            <h3 className="text-red-900 font-bold mb-2">Failed to Load</h3>
                            <p className="text-red-600/80 max-w-md mb-4">{anyError.message}</p>
                            <Button type="button" variant="secondary" size="sm" onClick={handleRetry}>
                                Retry
                            </Button>
                        </div>
                    )}

                    {!anyLoading && !anyError && (
                        <InspectorContent
                            beforeArtifacts={prevArtifactsQuery.data ?? {}}
                            afterArtifacts={artifactsQuery.data ?? {}}
                            stepDetail={stepDetailQuery.data}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

interface InspectorContentProps {
    beforeArtifacts: StepArtifacts;
    afterArtifacts: StepArtifacts;
    stepDetail: Step | undefined;
}

function InspectorContent({ beforeArtifacts, afterArtifacts, stepDetail }: InspectorContentProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<'summary' | 'vision' | 'context' | 'raw'>('summary');

    const trace = afterArtifacts.trace as (Record<string, unknown> & Partial<StepTrace>) | undefined;

    const tabs = [
        { id: 'summary', label: 'Summary', icon: '⚡' },
        { id: 'vision', label: 'Vision', icon: '👁️' },
        { id: 'context', label: 'Context', icon: '🌳' },
        { id: 'raw', label: 'Raw', icon: '{ }' },
    ] as const;

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
                <SegmentedControl
                    items={tabs.map((tab) => ({
                        value: tab.id,
                        label: `${tab.icon} ${tab.label}`
                    }))}
                    value={activeTab}
                    onChange={setActiveTab}
                    className="bg-gray-100"
                    activeItemClassName="bg-blue-50 text-blue-700"
                />
            </div>

            <div className="flex-1 overflow-hidden relative">
                <TabPanel id="summary" activeTab={activeTab}>
                    <SummaryTab stepDetail={stepDetail} beforeScreenshot={afterArtifacts.screenshots?.[0] ?? beforeArtifacts.screenshots?.[0]} />
                </TabPanel>
                <TabPanel id="vision" activeTab={activeTab}>
                    <VisionTab beforeScreenshots={beforeArtifacts.screenshots} currentScreenshots={afterArtifacts.screenshots} />
                </TabPanel>
                <TabPanel id="context" activeTab={activeTab} overflow={false}>
                    <ContextTab dom={afterArtifacts.dom ?? beforeArtifacts.dom} accessibility={afterArtifacts.accessibility ?? beforeArtifacts.accessibility} />
                </TabPanel>
                <TabPanel id="raw" activeTab={activeTab}>
                    <RawTab trace={trace} stepDetail={stepDetail} afterArtifacts={afterArtifacts} />
                </TabPanel>
            </div>
        </div>
    );
}

function SummaryTab({ stepDetail, beforeScreenshot }: {
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

function VisionTab({ beforeScreenshots, currentScreenshots }: {
    beforeScreenshots: string[] | undefined;
    currentScreenshots: string[] | undefined;
}): JSX.Element {
    const hasBefore = beforeScreenshots && beforeScreenshots.length > 0;
    const hasCurrent = currentScreenshots && currentScreenshots.length > 0;

    if (!hasBefore && !hasCurrent) {
        return <EmptyState icon="📷" title="No screenshots" description="Visual capture was disabled or failed for this step." />;
    }

    return (
        <div className="h-full grid grid-cols-2 divide-x divide-gray-200">
            <div className="flex flex-col overflow-hidden">
                <SectionBar className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    Previous Step
                </SectionBar>
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50/50">
                    {hasBefore ? (
                        <div className="space-y-4 w-full">
                            {beforeScreenshots.map((url, i) => (
                                <div key={i} className="relative rounded-lg overflow-hidden shadow-sm border border-gray-200 bg-white">
                                    <img src={url} alt={`Previous step ${i + 1}`} className="w-full h-auto object-contain" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-gray-400 text-sm italic">No previous step screenshot</div>
                    )}
                </div>
            </div>

            <div className="flex flex-col overflow-hidden">
                <SectionBar className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                    Current Step
                </SectionBar>
                <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50/50">
                    {hasCurrent ? (
                        <div className="space-y-4 w-full">
                            {currentScreenshots.map((url, i) => (
                                <div key={i} className="relative rounded-lg overflow-hidden shadow-sm border border-gray-200 bg-white">
                                    <img src={url} alt={`Current step ${i + 1}`} className="w-full h-auto object-contain" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-gray-400 text-sm italic">No screenshot for this step</div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ContextTab({ dom, accessibility }: {
    dom: Record<string, unknown> | undefined;
    accessibility: string | undefined;
}): JSX.Element {
    if (!dom && !accessibility) {
        return <EmptyState icon="🌳" title="No context data" description="DOM and accessibility data were not captured for this step." />;
    }

    return (
        <div className="h-full grid grid-cols-2 divide-x divide-gray-200">
            <div className="flex flex-col overflow-hidden bg-white">
                <SectionBar className="flex justify-between items-center">
                    <span>DOM Tree</span>
                    <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">PRE-ACTION</span>
                </SectionBar>
                <div className="flex-1 overflow-auto p-4">
                    {dom ? <JsonTreeView data={dom} name="DOM" /> : <div className="text-gray-400 text-sm italic">No DOM data</div>}
                </div>
            </div>
            <div className="flex flex-col overflow-hidden bg-white">
                <SectionBar className="flex justify-between items-center">
                    <span>Accessibility Tree</span>
                    <span className="text-[10px] font-mono bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">AX</span>
                </SectionBar>
                <div className="flex-1 overflow-auto p-4">
                    {accessibility ? <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{accessibility}</pre> : <div className="text-gray-400 text-sm italic">No ARIA data</div>}
                </div>
            </div>
        </div>
    );
}

function RawTab({ trace, stepDetail, afterArtifacts }: {
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

