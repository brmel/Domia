import React from 'react';
import { useTestRunStore } from '../stores';


/**
 * TestForm Component
 * Input form for URL and test prompt
 */
export function TestForm(): React.ReactElement {
    const {
        url, prompt, maxSteps, status, headless,
        setUrl, setPrompt, setMaxSteps, setHeadless, startTest
    } = useTestRunStore();

    const isRunning = status === 'running';

    const handleSubmit = (e: React.FormEvent): void => {
        e.preventDefault();
        if (url && prompt && !isRunning) {
            startTest();
        }
    };

    return (
        <form className="flex flex-col h-full bg-white" onSubmit={handleSubmit}>
            <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
                {/* URL Input Area */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Target URL</label>
                    <input
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all shadow-sm font-medium"
                        type="text"
                        placeholder="google.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onBlur={() => {
                            const trimmed = url.trim();
                            if (trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
                                setUrl(`https://${trimmed}`);
                            }
                        }}
                        disabled={isRunning}
                        required
                        autoFocus
                    />
                </div>

                {/* Prompt Area */}
                <div className="flex flex-col gap-2 flex-1 min-h-[120px]">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Goal</label>
                    <textarea
                        className="w-full h-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all shadow-sm resize-none leading-relaxed"
                        placeholder="e.g. Find the pricing page..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={isRunning}
                        required
                    />
                </div>

                {/* Settings Area */}
                <div className="bg-gray-50 rounded-xl p-5 space-y-4 border border-gray-100/80">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Max Steps</span>
                        <input
                            type="number"
                            min={1}
                            max={50}
                            value={maxSteps}
                            onChange={(e) => setMaxSteps(Number(e.target.value))}
                            className="w-16 px-2 py-1.5 bg-white border border-gray-200 rounded-md text-center text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-300 transition-all"
                            disabled={isRunning}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Headless Mode</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={headless}
                                onChange={(e) => setHeadless(e.target.checked)}
                                className="sr-only peer"
                                disabled={isRunning}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                        </label>
                    </div>
                </div>
            </div>

            {/* Action Button */}
            <div className="pt-6 mt-auto">
                <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-black hover:bg-gray-800 text-white font-semibold rounded-xl shadow-lg shadow-black/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                    disabled={isRunning || !url || !prompt}
                >
                    {isRunning ? (
                        <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            <span>Starting Agent...</span>
                        </>
                    ) : 'Start Agent'}
                </button>
            </div>
        </form>
    );
}
