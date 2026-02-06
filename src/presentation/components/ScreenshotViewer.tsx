import React from 'react';
import { useTestRunStore } from '../stores';
import './ScreenshotViewer.css';

/**
 * ScreenshotViewer Component
 * Displays screenshots from the agent loop
 */
export function ScreenshotViewer(): React.ReactElement {
    const { screenshots, latestScreenshot, status } = useTestRunStore();

    if (screenshots.length === 0 && !latestScreenshot) {
        return (
            <div className="screenshot-viewer empty">
                <div className="empty-state">
                    <span className="icon">📷</span>
                    <p>Screenshots will appear here</p>
                </div>
            </div>
        );
    }

    // Convert Buffer to data URL for display
    const getImageSrc = (buffer: Buffer): string => {
        const base64 = buffer.toString('base64');
        return `data:image/png;base64,${base64}`;
    };

    return (
        <div className="screenshot-viewer">
            {/* Latest Screenshot */}
            {latestScreenshot && (
                <div className="latest-screenshot">
                    <div className="screenshot-header">
                        <span className="label">Latest Screenshot</span>
                        {status === 'running' && <span className="live-badge">LIVE</span>}
                    </div>
                    <img src={getImageSrc(latestScreenshot)} alt="Latest screenshot" className="screenshot-image" />
                </div>
            )}

            {/* Screenshot History (collapsed) */}
            {screenshots.length > 1 && (
                <div className="screenshot-history">
                    <details>
                        <summary>History ({screenshots.length} screenshots)</summary>
                        <div className="history-grid">
                            {screenshots.map((screenshot, i) => (
                                <div key={i} className="history-item">
                                    <img src={getImageSrc(screenshot)} alt={`Screenshot ${i + 1}`} />
                                    <span className="history-number">#{i + 1}</span>
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            )}
        </div>
    );
}
