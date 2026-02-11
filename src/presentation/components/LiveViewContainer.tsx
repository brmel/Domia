import React, { useEffect, useRef } from 'react';
import { useTestRunStore } from '../stores';

export const LiveViewContainer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { status } = useTestRunStore();
    const isRunning = status === 'running';

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        let debounceTimer: NodeJS.Timeout;

        const performUpdate = (): void => {
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const bounds = {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };

            if (bounds.width > 0 && bounds.height > 0) {
                console.log('[LiveViewContainer] Sending bounds:', bounds, 'isRunning:', isRunning);
                if (isRunning) {
                    window.electron?.agentView?.show(bounds);
                } else {
                    window.electron?.agentView?.resize(bounds);
                }
            } else {
                console.warn('[LiveViewContainer] Invalid bounds calculated:', bounds);
            }
        };

        const updateBounds = (): void => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(performUpdate, 16); // Debounce at ~60fps
        };

        // Initial update (immediate, but could be debounced too, sticking to immediate for responsiveness)
        if (isRunning) {
            performUpdate();
        }

        const observer = new ResizeObserver(updateBounds);
        observer.observe(container);
        window.addEventListener('resize', updateBounds);

        return (): void => {
            clearTimeout(debounceTimer);
            observer.disconnect();
            window.removeEventListener('resize', updateBounds);
            // Hide the view when the component stops running (or unmounts)
            if (isRunning) {
                window.electron?.agentView?.hide();
            }
        };
    }, [isRunning]);

    // Ensure view is hidden on unmount (redundant safety)
    useEffect(() => {
        return (): void => {
            window.electron?.agentView?.hide();
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-transparent absolute inset-0 border-2 border-transparent data-[debug=true]:border-red-500"
            data-debug="true"
            style={{ minHeight: '100px', zIndex: isRunning ? 10 : -1 }}
        />
    );
};
