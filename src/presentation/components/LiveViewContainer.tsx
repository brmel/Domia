import React, { useEffect, useRef } from 'react';
import { useTestRunStore } from '../stores';

export const LiveViewContainer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isRunningRef = useRef(false);
    const performUpdateRef = useRef<(() => void) | null>(null);
    const { status } = useTestRunStore();
    const isRunning = status === 'running';

    useEffect(() => {
        isRunningRef.current = isRunning;
    }, [isRunning]);

    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

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
                const running = isRunningRef.current;
                console.log('[LiveViewContainer] Sending bounds:', bounds, 'isRunning:', running);
                if (running) {
                    window.electron?.agentView?.show(bounds);
                } else {
                    window.electron?.agentView?.hide();
                }
            } else {
                console.warn('[LiveViewContainer] Invalid bounds calculated:', bounds);
            }
        };

        const updateBounds = (): void => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(performUpdate, 16); // Debounce at ~60fps
        };

        performUpdateRef.current = performUpdate;

        performUpdate();

        const observer = new ResizeObserver(updateBounds);
        observer.observe(container);
        window.addEventListener('resize', updateBounds);

        return (): void => {
            clearTimeout(debounceTimer);
            observer.disconnect();
            window.removeEventListener('resize', updateBounds);
            performUpdateRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (isRunning) {
            performUpdateRef.current?.();
        } else {
            window.electron?.agentView?.hide();
        }
    }, [isRunning]);

    useEffect(() => {
        return (): void => {
            window.electron?.agentView?.hide();
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className={`w-full h-full bg-transparent absolute inset-0 ${isRunning ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}
            style={{ minHeight: '100px' }}
        />
    );
};
