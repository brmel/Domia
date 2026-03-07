import React from 'react';
import { useRunStore } from '../../stores';
import { RunState } from '@domain/enums';

export const LiveViewContainer: React.FC = () => {
    const { status, liveScreenshot } = useRunStore();
    const isRunning = status === RunState.RUNNING;
    const hasScreenshot = Boolean(liveScreenshot);
    const visible = isRunning || hasScreenshot;

    return (
        <div
            className={`w-full h-full min-h-0 relative ${visible ? 'z-10' : 'z-0 opacity-0 pointer-events-none'}`}
            style={{ minHeight: '100px' }}
        >
            {liveScreenshot ? (
                <img
                    src={`data:image/png;base64,${liveScreenshot}`}
                    alt="Agent live view"
                    className="absolute inset-0 w-full h-full object-contain rounded-sm"
                    style={{ imageRendering: 'auto' }}
                />
            ) : isRunning ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 rounded-sm gap-3">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
                    <span className="text-xs text-white/40 tracking-widest uppercase">Loading&hellip;</span>
                </div>
            ) : null}
        </div>
    );
};
