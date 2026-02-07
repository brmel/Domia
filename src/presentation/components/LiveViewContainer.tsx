import React, { useEffect, useRef } from 'react';
import { useTestRunStore } from '../stores';

export const LiveViewContainer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { status } = useTestRunStore();
    const isRunning = status === 'running';

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;

        const updateBounds = (): void => {
            const rect = container.getBoundingClientRect();
            const bounds = {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };

            if (bounds.width > 0 && bounds.height > 0) {
                if (isRunning) {
                    window.electron?.agentView?.show(bounds);
                } else {
                    window.electron?.agentView?.resize(bounds);
                }
            }
        };

        if (isRunning) {
            updateBounds();
        }

        const observer = new ResizeObserver(updateBounds);
        observer.observe(container);
        window.addEventListener('resize', updateBounds);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateBounds);
            if (!isRunning) {
                window.electron?.agentView?.hide();
            }
        };
    }, [isRunning]);

    useEffect(() => {
        return () => {
            window.electron?.agentView?.hide();
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-transparent absolute inset-0"
            style={{ minHeight: '100px', zIndex: isRunning ? 10 : -1 }}
        />
    );
};
