import React, { useEffect, useRef } from 'react';
import { useTestRunStore } from '../stores';

export const LiveViewContainer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { status } = useTestRunStore();
    const isRunning = status === 'running';

    useEffect(() => {
        if (!containerRef.current || !isRunning) {
            // If not running, make sure to hide it
            if (!isRunning) {
                window.electron?.agentView?.hide();
            }
            return;
        }

        const container = containerRef.current;

        // Initial show
        const updateBounds = () => {
            const rect = container.getBoundingClientRect();
            const bounds = {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };

            // Only update if dimensions are valid
            if (bounds.width > 0 && bounds.height > 0) {
                window.electron?.agentView?.show(bounds);
            }
        };

        // Update immediately
        updateBounds();

        // Observe resizes
        const observer = new ResizeObserver(() => {
            updateBounds();
        });

        observer.observe(container);
        window.addEventListener('resize', updateBounds); // Handle window resize too

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateBounds);
            window.electron?.agentView?.hide();
        };
    }, [isRunning]);

    if (!isRunning) return null;

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-transparent"
            style={{ minHeight: '100px' }}
        />
    );
};
