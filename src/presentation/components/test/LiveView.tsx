import React from 'react';
import { useTestRunStore } from '../../stores';
import { LiveViewContainer } from './LiveViewContainer';

export function LiveView(): React.ReactElement {
    const { status } = useTestRunStore();

    return (
        <div className="flex flex-col h-full bg-gray-900 overflow-hidden relative group rounded-xl shadow-2xl border border-gray-800 ring-1 ring-white/10">
            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-start pointer-events-none">
                <span className="inline-block px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-bold text-white/70 border border-white/10 tracking-widest uppercase shadow-sm">
                    LIVE VIEW
                </span>

                {status === 'running' && (
                    <div className="flex items-center gap-2 bg-red-500/90 backdrop-blur-md px-3 py-1 rounded-full shadow-lg shadow-red-500/20 animate-pulse border border-red-400/50">
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                        <span className="text-[10px] font-bold text-white tracking-widest uppercase">ON AIR</span>
                    </div>
                )}
            </div>

            {/* Content Container */}
            <div className="flex-1 flex items-center justify-center relative w-full h-full bg-transparent overflow-hidden">
                {/* Tech Grid Background */}
                <div className="absolute inset-0 opacity-[0.05]"
                    style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
                </div>

                {/* Waiting State - Only show when NOT running */}
                {status !== 'running' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-0">
                        <div className="w-16 h-16 rounded-full border border-gray-800 bg-gray-900/50 flex items-center justify-center relative mb-4">
                            <div className="absolute inset-0 rounded-full border border-white/5"></div>
                            <div className="w-2 h-2 bg-gray-700 rounded-full"></div>
                        </div>
                        <span className="text-xs uppercase tracking-[0.2em] font-medium text-gray-500 animate-pulse">
                            Ready to Stream
                        </span>
                    </div>
                )}

                {/* Native View Container - Handles the WebContentsView placement */}
                <LiveViewContainer />
            </div>
        </div>
    );
}
