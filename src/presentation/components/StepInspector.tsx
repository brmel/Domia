import { useRef } from 'react';
import { useStepInspectorStore } from '../stores/useStepInspectorStore';
import { trpc } from '../../lib/trpc';
import { JsonTreeView } from './JsonTreeView';
import { CognitiveTraceView } from './CognitiveTraceView'; // Assuming this exists or will be created

export function StepInspector(): JSX.Element | null {
    const { isOpen, runId, stepNumber, close } = useStepInspectorStore();
    const modalRef = useRef<HTMLDivElement>(null);

    // Fetch data only if open and IDs are present
    const { data: artifacts, isLoading, error } = trpc.history.getStepArtifacts.useQuery(
        { runId: runId!, stepNumber: stepNumber! },
        { enabled: isOpen && !!runId && stepNumber !== null, staleTime: Infinity }
    );

    // Generic tabs state - simpler than full component for now
    // Actually, let's use a local state for tabs: 'vision', 'semantic', 'trace'
    // But since I can't import useState here cleanly without modifying imports, 
    // I'll re-write imports in a second.
    // Wait, I can just use standard imports.
    // Let's rely on an inner component for tab state to keep this clean.

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8">
            <div
                ref={modalRef}
                className="bg-gray-900 border border-gray-700 w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-cyan-900/30 flex items-center justify-center text-cyan-400 font-bold border border-cyan-500/30">
                            {stepNumber}
                        </div>
                        <div>
                            <h2 className="text-gray-100 font-bold text-lg">Step Inspection</h2>
                            <p className="text-gray-500 text-xs font-mono">{runId}</p>
                        </div>
                    </div>
                    <button
                        onClick={close}
                        className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative">
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center text-cyan-400">
                            <span className="loading-spinner">Loading Artifacts...</span>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center text-red-400 p-8 text-center">
                            Failed to load artifacts: {error.message}
                        </div>
                    )}

                    {artifacts && <InspectorContent artifacts={artifacts} />}
                </div>
            </div>
            {/* Backdrop click to close */}
            <div className="absolute inset-0 -z-10" onClick={close} />
        </div>
    );
}

import { useState } from 'react';

function InspectorContent({ artifacts }: { artifacts: any }) {
    const [activeTab, setActiveTab] = useState<'vision' | 'semantic' | 'trace'>('vision');

    // Prioritize showing trace if vision is missing? Or stick to vision default?
    // Let's stick to vision.

    const screenshotUrl = artifacts.screenshot;
    const domTree = artifacts.dom;
    const accessibilityTree = artifacts.accessibility;
    const traceData = artifacts.trace;

    return (
        <div className="flex flex-col h-full">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-2 bg-gray-900 border-b border-gray-800">
                <TabButton
                    active={activeTab === 'vision'}
                    onClick={() => setActiveTab('vision')}
                    icon="👁️"
                    label="Vision"
                />
                <TabButton
                    active={activeTab === 'semantic'}
                    onClick={() => setActiveTab('semantic')}
                    icon="🌳"
                    label="Semantic"
                />
                <TabButton
                    active={activeTab === 'trace'}
                    onClick={() => setActiveTab('trace')}
                    icon="🧠"
                    label="Trace"
                />
            </div>

            {/* Pane Content */}
            <div className="flex-1 overflow-hidden bg-gray-950 relative">

                {activeTab === 'vision' && (
                    <div className="h-full w-full flex items-center justify-center p-8 overflow-auto">
                        {screenshotUrl ? (
                            <img
                                src={screenshotUrl}
                                alt="Step Screenshot"
                                className="max-w-full max-h-full object-contain rounded-lg border border-gray-800 shadow-2xl"
                            />
                        ) : (
                            <div className="text-gray-500">No screenshot available</div>
                        )}
                    </div>
                )}

                {activeTab === 'semantic' && (
                    <div className="h-full w-full grid grid-cols-2 gap-px bg-gray-800">
                        <div className="bg-gray-900 flex flex-col overflow-hidden">
                            <div className="p-2 bg-gray-800 text-xs text-gray-300 font-bold uppercase tracking-wider">DOM Tree</div>
                            <div className="flex-1 overflow-auto">
                                <JsonTreeView data={domTree} name="DOM" />
                            </div>
                        </div>
                        <div className="bg-gray-900 flex flex-col overflow-hidden">
                            <div className="p-2 bg-gray-800 text-xs text-gray-300 font-bold uppercase tracking-wider">Accessibility Tree</div>
                            <div className="flex-1 overflow-auto">
                                <JsonTreeView data={accessibilityTree} name="ARIA" />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'trace' && (
                    <div className="h-full w-full p-4 overflow-hidden">
                        {traceData ? (
                            <div className="h-full grid grid-cols-2 gap-4">
                                <div className="overflow-hidden flex flex-col">
                                    <div className="mb-2 text-xs text-gray-400 font-bold uppercase">Cognitive Flow</div>
                                    <CognitiveTraceView trace={traceData} />
                                </div>
                                <div className="overflow-hidden flex flex-col">
                                    <div className="mb-2 text-xs text-gray-400 font-bold uppercase">Raw Trace Data</div>
                                    <JsonTreeView data={traceData} name="Raw Trace" />
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-500">No trace data available</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: any) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${active
                ? 'bg-gray-800 text-cyan-400 shadow-sm border border-gray-700'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
        >
            <span>{icon}</span>
            <span>{label}</span>
        </button>
    );
}
