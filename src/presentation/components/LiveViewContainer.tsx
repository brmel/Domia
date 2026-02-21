import React, { useEffect, useRef } from 'react';
import { useTestRunStore } from '../stores';

export const LiveViewContainer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isRunningRef = useRef(false);
    const isVisibleRef = useRef(false);
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
        let frameRequest = 0;

        const performUpdate = (): void => {
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const isVisible = isVisibleRef.current;

            if (!isVisible) {
                window.electron?.agentView?.hide();
                return;
            }

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            const x = Math.max(0, Math.round(rect.left));
            const y = Math.max(0, Math.round(rect.top));
            const width = Math.max(0, Math.min(Math.round(rect.width), Math.max(0, viewportWidth - x)));
            const height = Math.max(0, Math.min(Math.round(rect.height), Math.max(0, viewportHeight - y)));

            const bounds = {
                x,
                y,
                width,
                height
            };

            if (bounds.width > 0 && bounds.height > 0) {
                const running = isRunningRef.current;
                if (running) {
                    window.electron?.agentView?.resize(bounds);
                    window.electron?.agentView?.show(bounds);
                } else {
                    window.electron?.agentView?.hide();
                }
            } else {
                // Invalid bounds — skip resize
            }
        };

        const updateBounds = (): void => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (frameRequest) {
                    cancelAnimationFrame(frameRequest);
                }
                frameRequest = requestAnimationFrame(performUpdate);
            }, 16);
        };

        performUpdateRef.current = performUpdate;

        performUpdate();

        const observer = new ResizeObserver(updateBounds);
        observer.observe(container);

        const intersectionObserver = new IntersectionObserver((entries) => {
            const [entry] = entries;
            isVisibleRef.current = Boolean(entry?.isIntersecting) && (entry?.intersectionRatio ?? 0) > 0;
            updateBounds();
        }, { threshold: [0, 0.01, 0.25] });
        intersectionObserver.observe(container);

        window.addEventListener('resize', updateBounds);
        window.addEventListener('scroll', updateBounds, true);

        return (): void => {
            clearTimeout(debounceTimer);
            if (frameRequest) {
                cancelAnimationFrame(frameRequest);
            }
            observer.disconnect();
            intersectionObserver.disconnect();
            window.removeEventListener('resize', updateBounds);
            window.removeEventListener('scroll', updateBounds, true);
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
            className={`w-full h-full min-h-0 bg-transparent ${isRunning ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}
            style={{ minHeight: '100px' }}
        />
    );
};
