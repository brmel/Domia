import React from 'react';
import { useTestRunStore } from '../stores';

export function ScreenshotViewer(): React.ReactElement {
    const { screenshots, latestScreenshot, status } = useTestRunStore();

    const getImageSrc = (data: any): string => {
        if (!data) return '';

        if (typeof data === 'string') {
            return `data:image/png;base64,${data}`;
        }

        let bytes: Uint8Array;

        if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
            bytes = new Uint8Array(data.data);
        } else if (data instanceof Uint8Array) {
            bytes = data;
        } else if (Buffer.isBuffer(data)) {
            bytes = new Uint8Array(data);
        } else if (Array.isArray(data)) {
            bytes = new Uint8Array(data);
        } else {
            return '';
        }

        const blob = new Blob([bytes as any], { type: 'image/png' });
        return URL.createObjectURL(blob);
    };

    if (screenshots.length === 0 && !latestScreenshot) {
        return (
            <div className="flex flex-col h-full bg-gray-50/50 items-center justify-center border-b border-gray-200">
                <div className="text-center space-y-3">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mx-auto">
                        <span className="text-2xl opacity-50">📷</span>
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">Live View</h3>
                        <p className="text-sm text-gray-500">Agent activity will appear here</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-900 overflow-hidden relative group rounded-xl shadow-2xl border border-gray-800 ring-1 ring-white/10">
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

            {/* Main Image Container */}
            <div className="flex-1 flex items-center justify-center relative w-full h-full bg-black overflow-hidden">
                {/* Tech Grid Background */}
                <div className="absolute inset-0 opacity-[0.05]"
                    style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
                </div>

                {/* Radial Gradient Glow */}
                <div className="absolute inset-0 bg-radial-at-c from-gray-800/20 to-transparent pointer-events-none"></div>

                {latestScreenshot ? (
                    <img
                        src={getImageSrc(latestScreenshot)}
                        alt="Live Agent View"
                        className="max-w-full max-h-full object-contain shadow-2xl transition-opacity duration-200 z-0"
                    />
                ) : (
                    <div className="text-gray-600 font-mono text-sm flex flex-col items-center gap-4 z-0">
                        <div className="w-16 h-16 rounded-full border border-gray-800 bg-gray-900/50 flex items-center justify-center relative">
                            <div className="absolute inset-0 rounded-full border border-white/5 animate-ping"></div>
                            <div className="w-2 h-2 bg-gray-700 rounded-full"></div>
                        </div>
                        <span className="text-xs uppercase tracking-[0.2em] font-medium text-gray-700">Awaiting Signal</span>
                    </div>
                )}
            </div>
        </div>
    );
}
