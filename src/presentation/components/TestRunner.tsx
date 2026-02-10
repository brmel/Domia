import React from 'react';
import { useTestRunStore, useStepInspectorStore } from '../stores';
import type { AgentAction } from '@domain/value-objects';
import { cn } from '../../lib/utils';
import { trpc } from '../../lib/trpc';
import { AgentStatus } from '../../domain/types/AgentStatus';


export function TestRunner(): React.ReactElement {
    const { status, currentAction, plan, history, success, summary, errorMessage, handleEvent, testRunId: runId } =
        useTestRunStore();
    const { open } = useStepInspectorStore();

    trpc.test.onUpdate.useSubscription(undefined, {
        onData: (event) => {
            handleEvent(event as Parameters<typeof handleEvent>[0]);
        },
        onError: (err) => {
            console.error('Subscription error:', err);
        },
        enabled: typeof window !== 'undefined' && 'electronTRPC' in window
    });

    const cancelMutation = trpc.test.cancel.useMutation({
        onError: (err) => {
            console.error('Failed to cancel test:', err);
        }
    });

    // Helper to safely get thought if it exists
    const getThought = (action: AgentAction): string | undefined => {
        return 'thought' in action ? (action as { thought?: string }).thought : undefined;
    };

    return (
        <div className="w-full h-full p-6 pt-2 overflow-hidden">
            <div className="flex h-full gap-4">
                {/* Main Content Area (Log & Results) */}
                <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-w-[300px]">
                    {/* Header Actions */}
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                        <div>
                            <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                                <span className={cn(
                                    "w-2 h-2 rounded-full transition-all duration-300",
                                    status === AgentStatus.RUNNING && "bg-blue-500 animate-pulse ring-2 ring-blue-500/30",
                                    status === AgentStatus.COMPLETED && "bg-green-500 ring-2 ring-green-500/30",
                                    status === AgentStatus.CANCELLED && "bg-yellow-500",
                                    status === AgentStatus.FAILED && "bg-red-500"
                                )}></span>
                                Activity Log
                            </h3>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">
                                Status: {status.toUpperCase()}
                            </div>
                        </div>

                        {status === AgentStatus.RUNNING && (
                            <button
                                onClick={() => cancelMutation.mutate()}
                                disabled={cancelMutation.isPending}
                                className="text-xs font-medium text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors border border-transparent hover:border-red-100 disabled:opacity-50"
                            >
                                {cancelMutation.isPending ? 'Stopping...' : 'Stop Agent'}
                            </button>
                        )}
                    </div>

                    {/* Log Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm relative">
                        {/* Welcome Message */}
                        {history.length === 0 && !currentAction && status === AgentStatus.IDLE && (
                            <div className="text-gray-400 text-center mt-10 italic">
                                Agent is ready. Waiting for instructions...
                            </div>
                        )}

                        {/* Pending Action (Currently executing) - Show at Top if running */}
                        {currentAction && status === AgentStatus.RUNNING && (
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
                        {(status === AgentStatus.COMPLETED || status === AgentStatus.FAILED) && (
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
                                            {status === AgentStatus.FAILED ? errorMessage : summary}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* History Steps (Newest first) */}
                        {history.slice().reverse().map((action, i) => {
                            const stepNum = history.length - i;
                            return (
                                <div
                                    key={i}
                                    onClick={() => runId && open(runId, stepNum)}
                                    className="group flex gap-4 p-3 rounded-xl border border-transparent hover:border-gray-200 hover:bg-gray-50 transition-all cursor-pointer"
                                >
                                    <span className="text-xs font-bold text-gray-400 mt-1 w-6">#{stepNum}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={cn(
                                                "text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                                                action.type === 'fail' ? 'bg-red-100 text-red-700' :
                                                    action.type === 'pass' ? 'bg-green-100 text-green-700' :
                                                        'bg-gray-100 text-gray-600'
                                            )}>
                                                {action.type}
                                            </span>
                                            {/* Hover prompt to inspect */}
                                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-blue-500 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                                                INSPECT
                                            </span>
                                        </div>

                                        {/* Show thought for history items too if available */}
                                        {getThought(action) && (
                                            <p className="text-gray-500 text-xs mt-1 line-clamp-2 italic group-hover:line-clamp-none">
                                                "{getThought(action)}"
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right Sidebar: Plan Progress */}
                {plan && (
                    <div className="w-80 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="font-semibold text-gray-700 text-sm">Execution Plan</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="space-y-4">
                                {plan.items.map((item, i) => (
                                    <div key={i} className={cn(
                                        "relative pl-6 py-1 transition-all",
                                        item.status === 'active' ? "opacity-100" : "opacity-80"
                                    )}>
                                        {/* Timeline Line */}
                                        {i !== plan.items.length - 1 && (
                                            <div className="absolute left-[11px] top-6 bottom-[-16px] w-[2px] bg-gray-100"></div>
                                        )}

                                        {/* Status Dot */}
                                        <div className={cn(
                                            "absolute left-0 top-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 z-10 bg-white",
                                            item.status === 'completed' ? "border-green-500 text-green-600" :
                                                item.status === 'active' ? "border-blue-500 text-blue-600 ring-2 ring-blue-100" :
                                                    item.status === 'failed' ? "border-red-500 text-red-600" :
                                                        "border-gray-200 text-gray-300"
                                        )}>
                                            {item.status === 'completed' && <span className="text-[10px] font-bold">✓</span>}
                                            {item.status === 'failed' && <span className="text-[10px] font-bold">✕</span>}
                                            {item.status === 'active' && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>}
                                            {item.status === 'pending' && <span className="text-[10px]">○</span>}
                                        </div>

                                        {/* Content */}
                                        <div className={cn(
                                            "text-sm",
                                            item.status === 'active' ? "font-semibold text-gray-900" :
                                                item.status === 'completed' ? "text-gray-500" :
                                                    "text-gray-400"
                                        )}>
                                            {item.description}
                                        </div>
                                        {item.status === 'failed' && item.error && (
                                            <div className="mt-1 text-xs text-red-500 bg-red-50 p-2 rounded">
                                                {item.error}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
