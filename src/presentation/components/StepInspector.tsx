import { useRef, useState } from 'react';
import { useStepInspectorStore } from '../stores/useStepInspectorStore';
import { trpc } from '../trpc';
import { JsonTreeView } from './JsonTreeView';
import { CognitiveTraceView } from './CognitiveTraceView';
import { cn } from '../utils';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/SegmentedControl';
import type { StepArtifacts } from '@domain/ports/IStorageService';
import type { TestStep } from '@domain/ports/IPersistenceAdapter';

export function StepInspector(): JSX.Element | null {
    const { isOpen, runId, stepNumber, close } = useStepInspectorStore();
    const modalRef = useRef<HTMLDivElement>(null);

    const { data: artifacts, isLoading, error } = trpc.history.getStepArtifacts.useQuery(
        { runId: runId!, stepNumber: stepNumber! },
        { enabled: isOpen && !!runId && stepNumber !== null, staleTime: Infinity }
    );

    const { data: stepDetail } = trpc.history.getStepDetail.useQuery(
        { runId: runId!, stepNumber: stepNumber! },
        { enabled: isOpen && !!runId && stepNumber !== null, staleTime: Infinity }
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={close}
            />

            {/* Modal Window */}
            <div
                ref={modalRef}
                className="relative w-full max-w-6xl h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20 ring-1 ring-black/5"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header glass effect */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white/80 backdrop-blur-md z-1">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20 flex items-center justify-center text-white font-bold text-lg">
                            {stepNumber}
                        </div>
                        <div>
                            <h2 className="text-gray-900 font-bold text-lg tracking-tight">Step Inspection</h2>
                            <p className="text-gray-400 text-xs font-mono tracking-wide uppercase">ID: {runId?.slice(0, 8)}...</p>
                        </div>
                    </div>

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

                {/* Content Area */}
                <div className="flex-1 overflow-hidden bg-gray-50/50 relative">
                    {isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                            <span className="text-gray-500 font-medium text-sm animate-pulse">Retrieving artifacts...</span>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
                                <span className="text-2xl">⚠️</span>
                            </div>
                            <h3 className="text-red-900 font-bold mb-2">Failed to Load</h3>
                            <p className="text-red-600/80 max-w-md">{error.message}</p>
                        </div>
                    )}

                    {!isLoading && !error && artifacts && <InspectorContent artifacts={artifacts} stepDetail={stepDetail ?? undefined} />}
                </div>
            </div>
        </div>
    );
}

function InspectorContent({ artifacts, stepDetail }: { artifacts: StepArtifacts; stepDetail: TestStep | undefined }): JSX.Element {
    const [activeTab, setActiveTab] = useState<'action' | 'vision' | 'semantic' | 'trace'>('action');

    const domTree = artifacts.dom;
    const accessibilityTree = artifacts.accessibility;

    const traceData = artifacts.trace ?? undefined;

    const tabs = [
        { id: 'action', label: 'Action', icon: '⚡' },
        { id: 'vision', label: 'Vision', icon: '👁️' },
        { id: 'semantic', label: 'Semantic', icon: '🌳' },
        { id: 'trace', label: 'Trace', icon: '🧠' },
    ] as const;

    return (
        <div className="flex flex-col h-full">
            {/* Tab Navigation */}
            <div className="px-6 py-3 border-b border-gray-200 bg-white">
                <SegmentedControl
                    items={tabs.map((tab) => ({
                        value: tab.id,
                        label: `${tab.icon} ${tab.label}`
                    }))}
                    value={activeTab}
                    onChange={setActiveTab}
                    className="bg-gray-50"
                    activeItemClassName="bg-white text-blue-700"
                />
            </div>

            {/* Tab Panels */}
            <div className="flex-1 overflow-hidden relative">

                {/* Action Tab */}
                <div className={cn("absolute inset-0 transition-opacity duration-300 overflow-auto",
                    activeTab === 'action' ? "opacity-100 z-10" : "opacity-0 pointer-events-none")}>
                    <ActionDetailView stepDetail={stepDetail} />
                </div>

                {/* Vision Tab */}
                <div className={cn("absolute inset-0 p-6 flex items-center justify-center transition-opacity duration-300",
                    activeTab === 'vision' ? "opacity-100 z-10" : "opacity-0 pointer-events-none")}>
                    {artifacts.screenshots && artifacts.screenshots.length > 0 ? (
                        <div className="flex gap-4 overflow-x-auto p-4 w-full h-full items-center">
                            {artifacts.screenshots.map((url: string, index: number) => (
                                <div key={index} className="shrink-0 relative rounded-lg overflow-hidden shadow-2xl border border-gray-200 bg-white h-full max-w-[80%] snap-center">
                                    <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10">
                                        Scan {index + 1}
                                    </div>
                                    <img
                                        src={url}
                                        alt={`Step Screenshot ${index + 1}`}
                                        className="h-full w-auto object-contain"
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon="📷"
                            title="No screenshot"
                            description="Visual capture was disabled or failed for this step."
                        />
                    )}
                </div>

                {/* Semantic Tab */}
                <div className={cn("absolute inset-0 transition-opacity duration-300",
                    activeTab === 'semantic' ? "opacity-100 z-10" : "opacity-0 pointer-events-none")}>
                    <div className="h-full grid grid-cols-2 divide-x divide-gray-200">
                        <div className="flex flex-col overflow-hidden bg-white">
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                                <span>DOM Tree</span>
                                <span className="text-[10px] bg-gray-200 px-1.5 rounded text-gray-600">RAW</span>
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                                {domTree ? <JsonTreeView data={domTree} name="DOM" /> : <div className="text-gray-400 text-sm italic">No DOM data</div>}
                            </div>
                        </div>
                        <div className="flex flex-col overflow-hidden bg-white">
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider flex justify-between items-center">
                                <span>Accessibility Tree</span>
                                <span className="text-[10px] bg-purple-100 px-1.5 rounded text-purple-600 font-bold">AX</span>
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                                {accessibilityTree ? <JsonTreeView data={accessibilityTree} name="ARIA" /> : <div className="text-gray-400 text-sm italic">No ARIA data</div>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Trace Tab */}
                <div className={cn("absolute inset-0 transition-opacity duration-300",
                    activeTab === 'trace' ? "opacity-100 z-10" : "opacity-0 pointer-events-none")}>
                    {traceData ? (
                        <div className="h-full grid grid-cols-5 divide-x divide-gray-200">
                            {/* Cognitive Flow - Wider */}
                            <div className="col-span-3 flex flex-col overflow-hidden bg-white">
                                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Cognitive Process
                                </div>
                                <div className="flex-1 overflow-auto p-4">
                                    <CognitiveTraceView trace={traceData} />
                                </div>
                            </div>
                            {/* Raw Data - Narrows */}
                            <div className="col-span-2 flex flex-col overflow-hidden bg-gray-50/50">
                                <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Raw Trace Data
                                </div>
                                <div className="flex-1 overflow-auto p-4">
                                    <JsonTreeView data={traceData} name="Trace" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <EmptyState
                            icon="🧩"
                            title="No trace data"
                            description="Cognitive tracing information is missing for this step."
                        />
                    )}
                </div>

            </div>
        </div>
    );
}

function ActionDetailView({ stepDetail }: { stepDetail: TestStep | undefined }): JSX.Element {
    if (!stepDetail) {
        return <EmptyState icon="⚡" title="No action data" description="Action details are not available for this step." />;
    }
    const { actionType, actionPayload, assets, timestamp } = stepDetail;

    // Extract thought if present
    const thought = 'thought' in actionPayload ? (actionPayload as { thought?: string }).thought : undefined;

    // Build a clean params object excluding 'type' and 'thought' (shown separately)
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(actionPayload)) {
        if (key !== 'type' && key !== 'thought') {
            params[key] = value;
        }
    }

    return (
        <div className="p-6 space-y-6">
            {/* Action Type Badge + Timestamp */}
            <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-bold text-sm uppercase tracking-wider">
                    ⚡ {actionType}
                </span>
                <span className="text-xs text-gray-400 font-mono">{new Date(timestamp).toLocaleString()}</span>
            </div>

            {/* Thought */}
            {thought && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Agent Thought</div>
                    <p className="text-gray-800 text-sm leading-relaxed italic">"{thought}"</p>
                </div>
            )}

            {/* Parameters */}
            {Object.keys(params).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Parameters
                    </div>
                    <div className="p-4">
                        <div className="grid gap-3">
                            {Object.entries(params).map(([key, value]) => (
                                <div key={key} className="flex items-start gap-3">
                                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded shrink-0 min-w-[100px]">
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

            {/* Assets */}
            {assets && Object.keys(assets).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Saved Assets
                    </div>
                    <div className="p-4">
                        <div className="grid gap-2">
                            {Object.entries(assets).map(([key, path]) => (
                                <div key={key} className="flex items-center gap-3">
                                    <span className="text-xs font-mono bg-green-50 text-green-700 px-2 py-1 rounded shrink-0">
                                        {key}
                                    </span>
                                    <span className="text-xs text-gray-500 font-mono truncate">{path}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Full Payload (collapsible) */}
            <details className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <summary className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors">
                    Raw Action Payload
                </summary>
                <div className="p-4">
                    <JsonTreeView data={actionPayload as unknown as Record<string, unknown>} name="Action" />
                </div>
            </details>
        </div>
    );
}

function EmptyState({ icon, title, description }: { icon: string, title: string, description: string }): JSX.Element {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
            <div className="text-4xl mb-4 opacity-50">{icon}</div>
            <h4 className="text-gray-600 font-semibold mb-1">{title}</h4>
            <p className="text-sm max-w-xs">{description}</p>
        </div>
    );
}
