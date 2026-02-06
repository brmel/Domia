import React, { useEffect, useRef, useState } from 'react';
import { useTestRunStore } from '../stores';
import { trpc } from '../../lib/trpc';

/**
 * LiveView Component
 * Streams the agent's browser window using WebRTC and Electron desktopCapturer
 */
export function LiveView(): React.ReactElement {
    const { status } = useTestRunStore();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [streamError, setStreamError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        let activeStream: MediaStream | null = null;
        let pollInterval: NodeJS.Timeout;

        const startStream = async () => {
            // Simplified check - if trpc exists (it always should in this setup)
            if (!trpc) {
                setStreamError('Desktop Access API not available');
                return;
            }

            try {
                // Poll for the source until found
                const findSource = async () => {
                    // Using tRPC client instead of window.api
                    const sources = await trpc.desktop.getSources.query();
                    // Look for the window titled "Agent Browser" (set in PlaywrightAdapter)
                    const agentSource = sources.find((s: any) => s.name === 'Agent Browser');

                    if (agentSource) {
                        try {
                            const stream = await navigator.mediaDevices.getUserMedia({
                                audio: false,
                                video: {
                                    mandatory: {
                                        chromeMediaSource: 'desktop',
                                        chromeMediaSourceId: agentSource.id,
                                        minWidth: 1280,
                                        maxWidth: 1280,
                                        minHeight: 720,
                                        maxHeight: 720
                                    }
                                } as any
                            });

                            if (videoRef.current) {
                                videoRef.current.srcObject = stream;
                                videoRef.current.play();
                                activeStream = stream;
                                setIsConnected(true);
                                setStreamError(null);
                                clearInterval(pollInterval); // Stop polling once connected
                            }
                        } catch (err) {
                            console.error('Error accessing media stream:', err);
                            setStreamError('Failed to access video stream');
                        }
                    }
                };

                // Try immediately, then poll every 1s if running
                await findSource();
                if (status === 'running' && !activeStream) {
                    pollInterval = setInterval(findSource, 1000);
                }

            } catch (err) {
                console.error('Error getting sources:', err);
                setStreamError('Failed to get screen sources');
            }
        };

        if (status === 'running' || status === 'completed') {
            startStream();
        }

        return () => {
            clearInterval(pollInterval);
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
            }
            setIsConnected(false);
        };
    }, [status]);

    return (
        <div className="flex flex-col h-full bg-gray-900 overflow-hidden relative group rounded-xl shadow-2xl border border-gray-800 ring-1 ring-white/10">
            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-start pointer-events-none">
                <span className="inline-block px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-bold text-white/70 border border-white/10 tracking-widest uppercase shadow-sm">
                    LIVE STREAM
                </span>

                {status === 'running' && (
                    <div className="flex items-center gap-2 bg-red-500/90 backdrop-blur-md px-3 py-1 rounded-full shadow-lg shadow-red-500/20 animate-pulse border border-red-400/50">
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                        <span className="text-[10px] font-bold text-white tracking-widest uppercase">ON AIR</span>
                    </div>
                )}
            </div>

            {/* Video Container */}
            <div className="flex-1 flex items-center justify-center relative w-full h-full bg-black overflow-hidden">
                {/* Tech Grid Background */}
                <div className="absolute inset-0 opacity-[0.05]"
                    style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
                </div>

                {/* Error Message */}
                {streamError && (
                    <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/80">
                        <div className="text-red-400 font-mono text-sm max-w-xs text-center border border-red-900/50 bg-red-950/30 p-4 rounded-lg">
                            <div className="text-xs uppercase tracking-widest mb-2 opacity-70">Stream Error</div>
                            {streamError}
                        </div>
                    </div>
                )}

                {/* Waiting State */}
                {!isConnected && !streamError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-0">
                        <div className="w-16 h-16 rounded-full border border-gray-800 bg-gray-900/50 flex items-center justify-center relative mb-4">
                            <div className={`absolute inset-0 rounded-full border border-white/5 ${status === 'running' ? 'animate-ping' : ''}`}></div>
                            <div className={`w-2 h-2 bg-gray-700 rounded-full ${status === 'running' ? 'bg-blue-500' : ''}`}></div>
                        </div>
                        <span className="text-xs uppercase tracking-[0.2em] font-medium text-gray-500 animate-pulse">
                            {status === 'running' ? 'Acquiring Feed...' : 'Ready to Stream'}
                        </span>
                    </div>
                )}

                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    className={`max-w-full max-h-full object-contain shadow-2xl transition-opacity duration-500 ${isConnected ? 'opacity-100' : 'opacity-0'}`}
                />
            </div>
        </div>
    );
}
