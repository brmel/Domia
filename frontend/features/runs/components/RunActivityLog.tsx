import type { ReactElement } from 'react';
import { cn } from '@frontend/lib/cn';
import { getThought } from '@frontend/lib/actionUtils';
import { RunState } from '@domain/enums';
import type { AgentAction } from '@domain/value-objects';
import { Button } from '@frontend/ui/Button';
import { trpc } from '@frontend/api/trpc';

interface RunActivityLogProps {
    status: RunState;
    currentAction: AgentAction | null;
    history: AgentAction[];
    success: boolean | null;
    summary: string | null;
    errorMessage: string | null;
    runId: string | null;
    cancelIsPending: boolean;
    onCancel: () => void;
    onInspect: (stepNum: number) => void;
    onGenerateReport?: (formats: Array<'junit' | 'html'>) => void;
    reportPending?: boolean;
}

export function RunActivityLog({
    status,
    currentAction,
    history,
    success,
    summary,
    errorMessage,
    runId,
    cancelIsPending,
    onCancel,
    onInspect,
    onGenerateReport,
    reportPending,
}: RunActivityLogProps): ReactElement {
    return (
        <div className="min-h-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-w-0">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <div>
                    <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                        <span className={cn(
                            "w-2 h-2 rounded-full transition-all duration-300",
                            status === RunState.RUNNING && "bg-blue-500 animate-pulse ring-2 ring-blue-500/30",
                            status === RunState.COMPLETED && "bg-green-500 ring-2 ring-green-500/30",
                            status === RunState.CANCELLED && "bg-yellow-500",
                            status === RunState.FAILED && "bg-red-500",
                        )}></span>
                        Activity Log
                    </h3>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">
                        Status: {status.toUpperCase()}
                    </div>
                </div>

                {status === RunState.RUNNING && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onCancel}
                        disabled={cancelIsPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                        {cancelIsPending ? 'Stopping...' : 'Stop Agent'}
                    </Button>
                )}

                {(status === RunState.COMPLETED || status === RunState.FAILED) && runId && onGenerateReport && (
                    <div className="flex gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => onGenerateReport(['junit'])} disabled={!!reportPending}>
                            {reportPending ? '...' : 'JUnit'}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => onGenerateReport(['html'])} disabled={!!reportPending}>
                            {reportPending ? '...' : 'HTML'}
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 font-mono text-sm relative">
                {history.length === 0 && !currentAction && status === RunState.IDLE && (
                    <div className="text-gray-400 text-center mt-10 italic">
                        Agent is ready. Waiting for instructions...
                    </div>
                )}

                {currentAction && status === RunState.RUNNING && (
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

                {(status === RunState.COMPLETED || status === RunState.FAILED) && (
                    <div className={cn(
                        "p-4 rounded-xl border-l-4 shadow-sm mb-4 bg-white",
                        success ? "bg-green-50/50 border-green-500 text-green-900" : "bg-red-50/50 border-red-500 text-red-900",
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
                                    {status === RunState.FAILED ? errorMessage : summary}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {history.slice().reverse().map((action, i) => {
                    const stepNum = history.length - i;
                    return (
                        <div
                            key={`${runId}-${stepNum}`}
                            onClick={() => onInspect(stepNum)}
                            className="group flex gap-4 p-3 rounded-xl border border-transparent hover:border-gray-200 hover:bg-gray-50 transition-all cursor-pointer"
                        >
                            <span className="text-xs font-bold text-gray-400 mt-1 w-6">#{stepNum}</span>

                            {runId && <StepThumbnail runId={runId} stepNumber={stepNum} />}

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={cn(
                                        'text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider',
                                        action.type === 'finish' && 'verdict' in action && (action as { verdict?: string }).verdict === 'fail'
                                            ? 'bg-red-100 text-red-700'
                                            : action.type === 'finish' && 'verdict' in action && (action as { verdict?: string }).verdict === 'pass'
                                                ? 'bg-green-100 text-green-700'
                                                : action.type === 'finish'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-gray-100 text-gray-600',
                                    )}>
                                        {action.type}
                                    </span>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onInspect(stepNum);
                                        }}
                                        disabled={!runId}
                                        className="ml-auto border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                    >
                                        Inspect
                                    </Button>
                                </div>

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
    );
}

function StepThumbnail({ runId, stepNumber }: { runId: string; stepNumber: number }): ReactElement | null {
    const { data } = trpc.history.getStepArtifacts.useQuery(
        { runId, stepNumber },
        { staleTime: Infinity },
    );

    if (!data?.screenshots?.[0]) return null;

    return (
        <img
            src={data.screenshots[0]}
            alt={`Step ${stepNumber}`}
            className="w-16 h-10 rounded border border-gray-200 object-cover shrink-0 mt-0.5"
        />
    );
}
