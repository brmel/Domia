import React, { useEffect } from 'react';
import { useTestRunStore } from '../stores';


/**
 * TestRunner Component
 * Displays live agent loop progress and results
 */
export function TestRunner(): React.ReactElement {
    const { status, currentAction, steps, success, summary, errorMessage, handleEvent, cancelTest } =
        useTestRunStore();

    // Subscribe to IPC events (only in Electron environment)
    useEffect(() => {
        if (!window.api) return;
        const cleanup = window.api.onTestUpdate((event) => {
            handleEvent(event as Parameters<typeof handleEvent>[0]);
        });
        return cleanup;
    }, [handleEvent]);

    if (status === 'idle') return <></>;

    return (
        <div className="minimal-card p-4 mt-4">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold uppercase tracking-wider text-gray-500">Status</span>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${status === 'running' ? 'bg-blue-100 text-blue-700' :
                        status === 'completed' ? (success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') :
                            status === 'error' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                        }`}>
                        {status}
                    </span>
                </div>
                {status === 'running' && (
                    <button
                        onClick={cancelTest}
                        className="text-red-600 text-sm hover:underline"
                    >
                        Cancel
                    </button>
                )}
            </div>

            {/* Current Action */}
            {currentAction && (
                <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-100">
                    <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Current Action</div>
                    <div className="font-medium text-gray-900">{currentAction.type}</div>
                    {'thought' in currentAction && (
                        <div className="text-sm text-gray-600 mt-1 italic">{currentAction.thought}</div>
                    )}
                </div>
            )}

            {/* Result */}
            {(status === 'completed' || status === 'error') && (
                <div className={`p-3 rounded mb-4 ${success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                    }`}>
                    {status === 'error' ? errorMessage : summary}
                </div>
            )}

            {/* Steps Log - Collapsible or scrollable */}
            <div className="border-t pt-2">
                <div className="text-xs text-gray-500 font-semibold uppercase mb-2">History</div>
                <div className="max-h-40 overflow-y-auto space-y-2 text-sm">
                    {steps.map((step, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <span className="font-mono text-gray-400 w-6">#{step.stepNumber}</span>
                            <span className="flex-1 truncate">{step.action.type}</span>
                            <span className={
                                step.status.type === 'success' ? 'text-green-500' :
                                    step.status.type === 'failed' ? 'text-red-500' : 'text-gray-300'
                            }>
                                {step.status.type === 'success' ? '✓' : step.status.type === 'failed' ? '✗' : '○'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// End of component
