import React, { useEffect } from 'react';
import { useTestRunStore } from '../stores';
import './TestRunner.css';

/**
 * TestRunner Component
 * Displays live agent loop progress and results
 */
export function TestRunner(): React.ReactElement {
    const { status, currentPhase, currentAction, steps, success, summary, errorMessage, handleEvent, cancelTest } =
        useTestRunStore();

    // Subscribe to IPC events
    useEffect(() => {
        const cleanup = window.api.onTestUpdate((event) => {
            handleEvent(event as Parameters<typeof handleEvent>[0]);
        });
        return cleanup;
    }, [handleEvent]);

    if (status === 'idle') {
        return (
            <div className="test-runner idle">
                <div className="empty-state">
                    <span className="icon">🤖</span>
                    <p>Enter a URL and test goal to start</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`test-runner ${status}`}>
            {/* Status Header */}
            <div className="runner-header">
                <div className="status-badge" data-status={status}>
                    {getStatusLabel(status)}
                </div>
                {status === 'running' && (
                    <button className="cancel-btn" onClick={cancelTest}>
                        Cancel
                    </button>
                )}
            </div>

            {/* Current Phase Indicator */}
            {currentPhase && (
                <div className="phase-indicator">
                    <div className={`phase-step ${currentPhase === 'observing' ? 'active' : ''}`}>
                        <span className="phase-icon">👁️</span>
                        <span>Observing</span>
                    </div>
                    <div className="phase-arrow">→</div>
                    <div className={`phase-step ${currentPhase === 'thinking' ? 'active' : ''}`}>
                        <span className="phase-icon">🧠</span>
                        <span>Thinking</span>
                    </div>
                    <div className="phase-arrow">→</div>
                    <div className={`phase-step ${currentPhase === 'acting' ? 'active' : ''}`}>
                        <span className="phase-icon">⚡</span>
                        <span>Acting</span>
                    </div>
                </div>
            )}

            {/* Current Action */}
            {currentAction && (
                <div className="current-action">
                    <span className="action-type">{currentAction.type}</span>
                    {'thought' in currentAction && (
                        <p className="action-thought">{currentAction.thought}</p>
                    )}
                </div>
            )}

            {/* Steps Log */}
            {steps.length > 0 && (
                <div className="steps-log">
                    <h3>Steps ({steps.length})</h3>
                    <div className="steps-list">
                        {steps.map((step, i) => (
                            <div key={i} className="step-item">
                                <span className="step-number">#{step.stepNumber}</span>
                                <span className="step-action">{step.action.type}</span>
                                <span className="step-status" data-status={step.status.type}>
                                    {step.status.type === 'success' ? '✓' : step.status.type === 'failed' ? '✗' : '○'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Result */}
            {status === 'completed' && (
                <div className={`result ${success ? 'success' : 'failure'}`}>
                    <span className="result-icon">{success ? '✅' : '❌'}</span>
                    <span className="result-text">{summary}</span>
                </div>
            )}

            {/* Error */}
            {status === 'error' && (
                <div className="result error">
                    <span className="result-icon">⚠️</span>
                    <span className="result-text">{errorMessage}</span>
                </div>
            )}

            {/* Cancelled */}
            {status === 'cancelled' && (
                <div className="result cancelled">
                    <span className="result-icon">⏹️</span>
                    <span className="result-text">Test was cancelled</span>
                </div>
            )}
        </div>
    );
}

function getStatusLabel(status: string): string {
    switch (status) {
        case 'running':
            return '🏃 Running';
        case 'completed':
            return '✅ Completed';
        case 'cancelled':
            return '⏹️ Cancelled';
        case 'error':
            return '⚠️ Error';
        default:
            return status;
    }
}
