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

        if (loadingRun) return <div className="p-4 text-center text-gray-500">Loading details...</div>;
        if (!run) return <div className="p-4 text-center text-red-500">Run not found</div>;

        return (
            <div className="mt-4 border-t pt-4">
                <button
                    onClick={() => setSelectedRunId(null)}
                    className="mb-2 text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                    <span>←</span> Back to List
                </button>
                <h3 className="font-bold text-lg mb-2">Run Details</h3>
                <div className="bg-gray-100 p-3 rounded text-sm mb-4 space-y-1">
                    <p><strong className="font-semibold">URL:</strong> {run.url}</p>
                    <p><strong className="font-semibold">Status:</strong> <span className={run.status === 'pass' ? 'text-green-600 font-bold' : run.status === 'fail' ? 'text-red-600 font-bold' : 'text-yellow-600'}>{run.status.toUpperCase()}</span></p>
                    <p><strong className="font-semibold">Time:</strong> {new Date(run.startedAt).toLocaleString()}</p>
                    <p><strong className="font-semibold">Goal:</strong> {run.goal}</p>
                    <p><strong className="font-semibold">Summary:</strong> {run.summary}</p>
                </div>
                <h4 className="font-semibold mb-2 text-md">Steps ({run.steps?.length || 0})</h4>
                <div className="space-y-2">
                    {run.steps?.map((step: TestStep) => (
                        <div key={step.id} className="border p-3 rounded-md bg-white text-xs shadow-sm">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-gray-700">Step #{step.stepNumber}: {step.actionType}</span>
                                <span className="text-gray-400 font-mono text-[10px]">{new Date(step.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="mt-1 bg-gray-50 p-2 rounded overflow-x-auto border border-gray-100">
                                <pre className="text-[10px] text-gray-600">
                                    {JSON.stringify(step.actionPayload, null, 2)}
                                </pre>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-y-0 left-0 w-[400px] bg-white shadow-[10px_0_40px_rgba(0,0,0,0.1)] z-[100] flex flex-col transform transition-transform border-r border-gray-200">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 h-[64px]">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <span>📜</span> History & Database
                </h2>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {selectedRunId ? (
                    <RunDetails runId={selectedRunId} />
                ) : (
                    <div className="space-y-3">
                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                            <span className="text-sm font-medium text-gray-500">{runs.length} Runs stored</span>
                            <button
                                onClick={handleClearHistory}
                                className="text-xs text-red-600 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50 hover:border-red-300 transition-colors font-medium"
                            >
                                Clear Database
                            </button>
                        </div>

                        {loading && <div className="text-center text-gray-400 py-4">Loading runs...</div>}

                        {!loading && runs.map((run: TestRun) => (
                            <div
                                key={run.id}
                                onClick={() => setSelectedRunId(run.id)}
                                className="border border-gray-200 rounded-lg p-3 hover:bg-blue-50 hover:border-blue-200 cursor-pointer transition-all group shadow-sm hover:shadow"
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${run.status === 'pass' ? 'bg-green-100 text-green-700' :
                                        run.status === 'fail' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                        {run.status}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-mono">
                                        {new Date(run.startedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="font-medium text-sm text-gray-900 truncate pr-4">{run.goal}</div>
                                <div className="text-xs text-gray-500 truncate mt-1 flex items-center gap-1">
                                    <span className="opacity-50">🔗</span> {run.url}
                                </div>
                            </div>
                        ))}

                        {!loading && runs.length === 0 && (
                            <div className="text-center py-10">
                                <div className="text-4xl mb-3">📭</div>
                                <p className="text-gray-500 font-medium">No history found</p>
                                <p className="text-gray-400 text-xs mt-1">Run a test to see it here</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
