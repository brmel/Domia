import { useState, useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import type { TestRun, TestStep } from '@domain/ports';

type RunWithSteps = TestRun & { steps: TestStep[] };

export function HistorySidebar({ onClose }: { onClose: () => void }) {
    const [runs, setRuns] = useState<TestRun[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchRuns = async () => {
        setLoading(true);
        try {
            const data = await trpc.history.getRuns.query();
            setRuns(data);
        } catch (err) {
            console.error('Failed to fetch runs', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRuns();
    }, []);

    const handleClearHistory = async () => {
        if (confirm('Are you sure you want to delete all history? This cannot be undone.')) {
            try {
                await trpc.history.clear.mutate();
                fetchRuns(); // Refresh list
            } catch (err) {
                console.error('Failed to clear history', err);
                alert('Failed to clear history');
            }
        }
    };

    const RunDetails = ({ runId }: { runId: string }) => {
        const [run, setRun] = useState<RunWithSteps | null>(null);
        const [loadingRun, setLoadingRun] = useState(true);

        useEffect(() => {
            const fetchRun = async () => {
                setLoadingRun(true);
                try {
                    const data = await trpc.history.getRun.query({ id: runId });
                    setRun(data);
                } catch (err) {
                    console.error('Failed to fetch run details', err);
                } finally {
                    setLoadingRun(false);
                }
            };
            fetchRun();
        }, [runId]);

        if (loadingRun) return <div className="p-8 text-center text-gray-400 text-sm">Loading details...</div>;
        if (!run) return <div className="p-8 text-center text-red-500 text-sm">Run not found</div>;

        return (
            <div className="flex flex-col h-full bg-white">
                <div className="border-b border-gray-100 p-4 bg-gray-50/50">
                    <button
                        onClick={() => setSelectedRunId(null)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1.5 transition-colors mb-2"
                    >
                        <span>←</span> Back to List
                    </button>
                    <h3 className="font-bold text-gray-900 text-base leading-tight">{run.goal}</h3>
                    <div className="mt-2 flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${run.status === 'pass' ? 'bg-green-100 text-green-700' :
                            run.status === 'fail' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                            {run.status}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                            {new Date(run.startedAt).toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="bg-gray-50 p-3 rounded-md text-sm border border-gray-100">
                        <p className="mb-1"><strong className="font-semibold text-gray-700">URL:</strong> <span className="text-blue-600">{run.url}</span></p>
                        {run.summary && <p className="mt-2 text-gray-600 leading-relaxed">{run.summary}</p>}
                    </div>

                    <div>
                        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-3">Timeline ({run.steps?.length || 0})</h4>
                        <div className="space-y-3 relative before:absolute before:inset-y-0 before:left-2 before:w-0.5 before:bg-gray-100">
                            {run.steps?.map((step: TestStep) => (
                                <div key={step.id} className="relative pl-6">
                                    <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-white border-2 border-blue-100 z-10"></div>
                                    <div className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="font-semibold text-gray-800 text-sm">Step {step.stepNumber}: {step.actionType}</span>
                                            <span className="text-gray-400 font-mono text-[10px]">{new Date(step.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        <div className="bg-gray-50 rounded p-2 overflow-x-auto border border-gray-100">
                                            <pre className="text-[10px] text-gray-600 font-mono leading-tight">
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
        <div className="flex flex-col h-full w-full bg-white">
            <div className="p-4 border-b border-gray-100 bg-white flex justify-between items-center shrink-0">
                <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900">
                    <span>📜</span> History
                </h2>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded-full transition-colors"
                    title="Close History"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
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
                            <button
                                onClick={handleClearHistory}
                                className="text-[10px] text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors font-medium"
                            >
                                Clear All
                            </button>
                        </div>

                        {loading && <div className="text-center text-gray-400 py-8 text-sm">Loading runs...</div>}

                        {!loading && runs.map((run: TestRun) => (
                            <div
                                key={run.id}
                                onClick={() => setSelectedRunId(run.id)}
                                className="group mb-2 border border-gray-100 rounded-lg p-3 hover:bg-blue-50/50 hover:border-blue-200 cursor-pointer transition-all active:scale-[0.99]"
                            >
                                <div className="flex justify-between items-start mb-1.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${run.status === 'pass' ? 'bg-green-100 text-green-700' :
                                        run.status === 'fail' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                        {run.status}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-mono">
                                        {new Date(run.startedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="font-medium text-sm text-gray-900 truncate mb-1 group-hover:text-blue-700 transition-colors">{run.goal}</div>
                                <div className="text-xs text-gray-500 truncate flex items-center gap-1.5">
                                    <span className="opacity-40">🔗</span> {run.url}
                                </div>
                            </div>
                        ))}

                        {!loading && runs.length === 0 && (
                            <div className="text-center py-12 px-4">
                                <div className="text-4xl mb-3 opacity-20">📭</div>
                                <p className="text-gray-500 font-medium text-sm">No history found</p>
                                <p className="text-gray-400 text-xs mt-1">Run a test to see it here</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
