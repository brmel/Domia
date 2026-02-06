import React from 'react';
import { useTestRunStore } from '../stores';
import './TestForm.css';

/**
 * TestForm Component
 * Input form for URL and test prompt
 */
export function TestForm(): React.ReactElement {
    const { url, prompt, maxSteps, status, setUrl, setPrompt, setMaxSteps, startTest } =
        useTestRunStore();

    const isRunning = status === 'running';

    const handleSubmit = (e: React.FormEvent): void => {
        e.preventDefault();
        if (url && prompt && !isRunning) {
            startTest();
        }
    };

    return (
        <form className="minimal-card p-4 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
                <input
                    className="minimal-input"
                    type="url"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isRunning}
                    required
                />

                <textarea
                    className="minimal-input min-h-[80px]"
                    placeholder="Describe what you want to test..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isRunning}
                    required
                />
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <label htmlFor="maxSteps">Max Steps:</label>
                    <input
                        id="maxSteps"
                        type="number"
                        min={1}
                        max={50}
                        value={maxSteps}
                        onChange={(e) => setMaxSteps(Number(e.target.value))}
                        className="minimal-input w-16 !p-1 text-center"
                        disabled={isRunning}
                    />
                </div>

                <button
                    type="submit"
                    className="minimal-button"
                    disabled={isRunning || !url || !prompt}
                >
                    {isRunning ? 'Running...' : 'Start Test'}
                </button>
            </div>
        </form>
    );
}
