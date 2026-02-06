import React from 'react';
import { useTestRunStore } from '../stores';
import './TestForm.css';

/**
 * TestForm Component
 * Input form for URL and test prompt
 */
export function TestForm(): React.ReactElement {
    const { url, prompt, headless, maxSteps, status, setUrl, setPrompt, setHeadless, setMaxSteps, startTest } =
        useTestRunStore();

    const isRunning = status === 'running';

    const handleSubmit = (e: React.FormEvent): void => {
        e.preventDefault();
        if (url && prompt && !isRunning) {
            startTest();
        }
    };

    return (
        <form className="test-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label htmlFor="url">Target URL</label>
                <input
                    id="url"
                    type="url"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isRunning}
                    required
                />
            </div>

            <div className="form-group">
                <label htmlFor="prompt">Test Goal</label>
                <textarea
                    id="prompt"
                    placeholder="Describe what you want to test..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isRunning}
                    rows={3}
                    required
                />
            </div>

            <div className="form-row">
                <div className="form-group checkbox-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={headless}
                            onChange={(e) => setHeadless(e.target.checked)}
                            disabled={isRunning}
                        />
                        Headless Mode
                    </label>
                </div>

                <div className="form-group">
                    <label htmlFor="maxSteps">Max Steps</label>
                    <input
                        id="maxSteps"
                        type="number"
                        min={1}
                        max={50}
                        value={maxSteps}
                        onChange={(e) => setMaxSteps(Number(e.target.value))}
                        disabled={isRunning}
                    />
                </div>
            </div>

            <button type="submit" className="submit-btn" disabled={isRunning || !url || !prompt}>
                {isRunning ? 'Running...' : 'Start Test'}
            </button>
        </form>
    );
}
