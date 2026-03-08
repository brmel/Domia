import { useState } from 'react';
import { trpc } from '../../trpc';
import type { Step } from '@domain/ports';
import { useStepInspectorStore } from '../../stores/useStepInspectorStore';
import { Button } from '../ui/Button';

interface HistorySidebarProps {
    onClose: () => void;
    disabled?: boolean;
}

export function HistorySidebar({ onClose, disabled = false }: HistorySidebarProps): JSX.Element {
    const utils = trpc.useUtils();
    const { data: runs = [], isLoading: loading } = trpc.history.getRuns.useQuery();
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

    const clearMutation = trpc.history.clear.useMutation({
        onSuccess: () => {
            utils.history.getRuns.invalidate();
        }
    });

    const handleClearHistory = async (): Promise<void> => {
        if (confirm('Are you sure you want to delete all history? This cannot be undone.')) {
            try {
                await clearMutation.mutateAsync();
            } catch (_) {
                alert('Failed to clear history');
            }
        }
    };

    const RunDetails = ({ runId }: { runId: string }): JSX.Element => {
        const { data: run, isLoading: loadingRun } = trpc.history.getRun.useQuery({ id: runId });

        if (loadingRun) return <div className="p-8 text-center text-gray-400 text-sm">Loading details...</div>;
        if (!run) return <div className="p-8 text-center text-red-500 text-sm">Run not found</div>;

        let summary = '';
        if (run.status.type === 'passed') summary = run.status.summary;
        if (run.status.type === 'failed') summary = run.status.error;
        if (run.status.type === 'cancelled') summary = run.status.reason;

        return (
            <div className="flex flex-col h-full bg-white">
                <div className="border-b border-gray-100 p-5 bg-gray-50/50">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedRunId(null)}
                        className="mb-2 px-0 text-gray-500 hover:text-gray-900"
                    >
                        <span>←</span> Back to list
                    </Button>
                    <h3 className="font-bold text-gray-900 text-base leading-tight">{run.prompt}</h3>
                    <div className="mt-2 flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${run.status.type === 'passed' ? 'bg-green-100 text-green-700' :
                            run.status.type === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                            {run.status.type}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">
                            {run.startedAt ? run.startedAt.toLocaleString() : 'N/A'}
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <div className="bg-gray-50 p-4 rounded-md text-sm border border-gray-100">
                        <p className="mb-1"><strong className="font-semibold text-gray-700">URL:</strong> <span className="text-blue-600">{run.url}</span></p>
                        {summary && <p className="mt-2 text-gray-600 leading-relaxed">{summary}</p>}
                    </div>

                    <div>
                        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-3">Timeline ({run.steps?.length || 0})</h4>
                        <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-2 before:w-0.5 before:bg-gray-100">
                            {run.steps?.map((step: Step) => (
                                <div key={step.id} className="relative pl-6">
                                    <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-white border-2 border-blue-100 z-10"></div>
                                    <div
                                        onClick={() => useStepInspectorStore.getState().open(runId, step.stepNumber)}
                                        className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-blue-300 group"
                                    >
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="font-semibold text-gray-800 text-sm group-hover:text-blue-600">Step {step.stepNumber}: {step.actionType}</span>
                                            <span className="text-gray-400 font-mono text-[10px]">{new Date(step.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                useStepInspectorStore.getState().open(runId, step.stepNumber);
                                            }}
                                            className="mb-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                        >
                                            Inspect
                                        </Button>
                                        <div className="bg-gray-50 rounded p-3 overflow-x-auto border border-gray-100 group-hover:bg-blue-50/30 transition-colors max-h-52">
                                            <pre className="text-xs text-gray-600 font-mono leading-tight">
                                                {JSON.stringify(step.actionPayload, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`flex flex-col h-full w-full bg-white ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="p-4 border-b border-gray-100 bg-white flex justify-between items-center shrink-0">
                <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900">
                    <span>📜</span> History
                </h2>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    disabled={disabled}
                    className="p-1.5 rounded-full text-gray-400 hover:text-gray-700"
                    title="Close History"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </Button>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {selectedRunId ? (
                    <div className="absolute inset-0 overflow-y-auto">
                        <RunDetails runId={selectedRunId} />
                    </div>
                ) : (
                    <div className="absolute inset-0 overflow-y-auto p-4">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{runs.length} Runs</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleClearHistory}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                                Clear history
                            </Button>
                        </div>

                        {loading && <div className="text-center text-gray-400 py-8 text-sm">Loading runs...</div>}

                        {!loading && runs.map((run) => (
                            <div
                                key={run.id}
                                onClick={() => setSelectedRunId(run.id)}
                                className="group mb-2 border border-gray-100 rounded-lg p-3 hover:bg-blue-50/50 hover:border-blue-200 cursor-pointer transition-all active:scale-[0.99]"
                            >
                                <div className="flex justify-between items-start mb-1.5">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${run.status.type === 'passed' ? 'bg-green-100 text-green-700' :
                                        run.status.type === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                        {run.status.type}
                                    </span>
                                    <span className="text-xs text-gray-400 font-mono">
                                        {run.startedAt ? new Date(run.startedAt).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                                <div className="font-medium text-sm text-gray-900 truncate mb-1 group-hover:text-blue-700 transition-colors">{run.prompt}</div>
                                <div className="text-xs text-gray-500 truncate flex items-center gap-1.5">
                                    <span className="opacity-40">🔗</span> {run.url}
                                </div>
                            </div>
                        ))}

                        {!loading && runs.length === 0 && (
                            <div className="text-center py-12 px-4">
                                <div className="text-4xl mb-3 opacity-20">📭</div>
                                <p className="text-gray-500 font-medium text-sm">No history found</p>
                                <p className="text-gray-400 text-xs mt-1">Start a run to see it here</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
