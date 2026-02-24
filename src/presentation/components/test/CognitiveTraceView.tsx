import { StepTrace } from '@domain/ports/ITraceService';

interface CognitiveTraceViewProps {
    trace: Partial<StepTrace>;
}

export function CognitiveTraceView({ trace }: CognitiveTraceViewProps): JSX.Element {
    if (!trace) return <div className="text-gray-500 text-sm p-4">No trace data available</div>;

    const actionType = (() : string => {
        const action = trace.agentOutput?.action;
        if (!action || typeof action !== 'object') {
            return 'unknown';
        }

        if ('type' in action) {
            const typedAction = action as { type?: unknown };
            return typedAction.type ? String(typedAction.type) : 'unknown';
        }

        return 'unknown';
    })();

    return (
        <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* Agent Input / Goal */}
                {trace.agentInput && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-900/50 flex items-center justify-center text-blue-400">
                                🤖
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Input & Context</span>
                        </div>
                        <div className="ml-10 bg-[#1e1e1e] border border-gray-800 rounded-lg p-4 text-sm text-gray-300">
                            <div className="mb-2">
                                <span className="text-blue-400 font-bold">Goal:</span> {trace.agentInput.goal}
                            </div>
                            {trace.agentInput.currentUrl && (
                                <div className="mb-2 text-xs text-gray-500">
                                    <span className="font-bold">URL:</span> {trace.agentInput.currentUrl}
                                </div>
                            )}
                            {trace.agentInput.promptPreview && (
                                <details className="mt-2">
                                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">Show Prompt Context</summary>
                                    <pre className="mt-2 text-[10px] text-gray-500 whitespace-pre-wrap font-mono p-2 bg-black rounded">
                                        {trace.agentInput.promptPreview}
                                    </pre>
                                </details>
                            )}
                        </div>
                    </div>
                )}

                {/* Agent Thinking / Output */}
                {trace.agentOutput && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center text-purple-400">
                                🧠
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reasoning & Action</span>
                        </div>
                        <div className="ml-10 bg-linear-to-br from-[#1e1e1e] to-[#252525] border border-purple-900/30 rounded-lg p-4 text-sm text-gray-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>

                            {trace.agentOutput.thought && (
                                <div className="mb-4 italic text-gray-400">
                                    "{trace.agentOutput.thought}"
                                </div>
                            )}

                            {trace.agentOutput.action && (
                                <div className="bg-black/30 rounded p-3 border border-white/5">
                                    <div className="text-xs font-bold text-purple-300 mb-1 uppercase">Action: {actionType}</div>
                                    <pre className="text-[10px] text-gray-500 font-mono whitespace-pre-wrap">
                                        {JSON.stringify(trace.agentOutput.action, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Errors */}

                {/* Metadata sensors */}
                {trace.sensorData && (
                    <div className="flex justify-end">
                        <div className="text-[10px] text-gray-600 font-mono">
                            Sensors: DOM({trace.sensorData.domCount}) | Vision({trace.sensorData.visionPresent ? 'Yes' : 'No'})
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
