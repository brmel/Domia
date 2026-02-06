import React from 'react';
import { useTestRunStore } from '../stores';


/**
 * ScreenshotViewer Component
 * Displays screenshots from the agent loop
 */
export function ScreenshotViewer(): React.ReactElement {
    const { screenshots, latestScreenshot, status } = useTestRunStore();

    // Convert Buffer to data URL for display
    const getImageSrc = (buffer: Buffer): string => {
        const base64 = buffer.toString('base64');
        return `data:image/png;base64,${base64}`;
    };

    if (screenshots.length === 0 && !latestScreenshot) {
        return (
            <div className="minimal-card flex items-center justify-center min-h-[400px] h-full bg-gray-50 border-dashed">
                <div className="text-center text-gray-400">
                    <span className="text-4xl block mb-2 opacity-50">📷</span>
                    <p>Live view will appear here</p>
                </div>
            </div>
        );
    }

    return (
        <div className="minimal-card overflow-hidden flex flex-col h-full min-h-[400px]">
            {/* Header */}
            <div className="px-4 py-2 border-b bg-gray-50 flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-widest">
                <span>Live View</span>
                {status === 'running' && (
                    <span className="flex items-center gap-1 text-red-500">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        LIVE
                    </span>
                )}
            </div>

            {/* Main Image */}
            <div className="flex-1 bg-gray-100 flex items-center justify-center p-4">
                {latestScreenshot ? (
                    <img
                        src={getImageSrc(latestScreenshot)}
                        alt="Latest screenshot"
                        className="max-w-full max-h-full object-contain shadow-sm rounded border border-gray-200"
                    />
                ) : (
                    <div className="text-gray-400 text-sm">Waiting for screenshot...</div>
                )}
            </div>
        </div>
    );
}
