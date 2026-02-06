import React, { useEffect } from 'react';
import { useTestRunStore } from '../stores';
import type { AgentAction } from '@domain/value-objects';
import { cn } from '../../lib/utils';
import { trpc } from '../../lib/trpc';

export function TestRunner(): React.ReactElement {
    const { status, currentAction, steps, success, summary, errorMessage, handleEvent, cancelTest } =
        useTestRunStore();

    useEffect(() => {
        const isElectron = typeof window !== 'undefined' && 'electronTRPC' in window;
        if (!isElectron) {
            return;
        }

        try {
            const subscription = trpc.test.onUpdate.subscribe(undefined, {
                onData: (event) => {
                    handleEvent(event as Parameters<typeof handleEvent>[0]);
                },
                onError: (err) => {
                    console.error('Subscription error:', err);
                }
            });
            return () => {
                subscription.unsubscribe();
            };
        } catch (err) {
            console.error('Failed to subscribe to test updates:', err);
        }
    }, [handleEvent]);



    // Helper to safely get thought if it exists
    const getThought = (action: AgentAction): string | undefined => {
        return 'thought' in action ? (action as { thought?: string }).thought : undefined;
    };

    return (
        <div className="w-full h-full p-6 pt-2">
            <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header Actions */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                            <span className={cn(
                                "w-2 h-2 rounded-full transition-all duration-300",
                                status === 'running' && "bg-blue-500 animate-pulse ring-2 ring-blue-500/30",
                                status === 'completed' && "bg-green-500 ring-2 ring-green-500/30",
                                status === 'cancelled' && "bg-yellow-500",
                                status === 'error' && "bg-red-500"
                            )}></span>
                            Activity Log
                        </h3>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">
                            Status: {status.toUpperCase()}
                        </div>
                    </div>

                    {status === 'running' && (
                        <button
                            onClick={cancelTest}
                            className="text-xs font-medium text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors border border-transparent hover:border-red-100"
                        >
                            Stop Agent
                        </button>
                    )}
                </div>

                {/* Log Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm relative">
                    {/* Welcome Message */}
                    {steps.length === 0 && !currentAction && status === 'idle' && (
                        <div className="text-gray-400 text-center mt-10 italic">
                            Agent is ready. Waiting for instructions...
                        </div>
                    )}

                    {/* Pending Action (Currently executing) - Show at Top if running */}
                    {currentAction && status === 'running' && (
                        <div className="border-l-4 border-blue-500 pl-4 py-3 bg-blue-50/10 animate-pulse rounded-r-lg">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">Processing</span>
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></span>
                            </div>
                            <div className="text-gray-900 font-bold text-lg mb-1">{currentAction.type}</div>
                            {getThought(currentAction) && (
                                <div className="text-gray-600 text-sm italic leading-relaxed">"{getThought(currentAction)}"</div>
                            )}
                        </div>
                    )}

                    {/* Result Card (Inlined if completed) */}
                    {(status === 'completed' || status === 'error') && (
                        <div className={cn(
                            "p-4 rounded-xl border-l-4 shadow-sm mb-4 bg-white",
                            success ? "bg-green-50/50 border-green-500 text-green-900" : "bg-red-50/50 border-red-500 text-red-900"
                        )}>
                            <div className="flex items-start gap-4">
                                <div className={`p-2 rounded-full ${success ? 'bg-green-100' : 'bg-red-100'}`}>
                                    <span className="text-2xl">{success ? '🎉' : '❌'}</span>
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-base uppercase tracking-wide mb-1">
                                        {success ? 'Goal Achieved' : 'Goal Failed'}
                                    </h4>
                                    <p className="text-sm leading-relaxed opacity-90 whitespace-pre-wrap">
                                        {status === 'error' ? errorMessage : summary}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* History Steps (Newest first) */}
                    {steps.slice().reverse().map((step, i) => (
                        <div key={i} className="group flex gap-4 p-3 rounded-xl border border-transparent hover:border-gray-100 hover:bg-gray-50 transition-all">
                            <span className="text-xs font-bold text-gray-400 mt-1 w-6">#{step.stepNumber}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${step.action.type === 'fail' ? 'bg-red-100 text-red-700' :
                                        step.action.type === 'pass' ? 'bg-green-100 text-green-700' :
                                            'bg-gray-100 text-gray-600'
                                        }`}>
                                        {step.action.type}
                                    </span>
                                    <span className="text-xs text-gray-300">
                                        {step.status.type === 'success' ? '✓' : '✗'}
                                    </span>
                                </div>

                                {step.status.type === 'failed' && (
                                    <div className="text-red-600 text-xs mt-1 font-medium bg-red-50 p-2 rounded">
                                        Error: {step.status.error}
                                    </div>
                                )}

                                {/* Show thought for history items too if available (optional, checking type) */}
                                {'thought' in step.action && (step.action as any).thought && (
                                    <p className="text-gray-500 text-xs mt-1 line-clamp-2 italic group-hover:line-clamp-none">
                                        "{(step.action as any).thought}"
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
