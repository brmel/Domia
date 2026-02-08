import { TestForm } from './presentation/components/TestForm';
import { TestRunner } from './presentation/components/TestRunner';
import { LiveView } from './presentation/components/LiveView';
import { ResizableSidebar } from './presentation/components/ResizableSidebar';

import { useState } from 'react';
import { HistorySidebar } from './presentation/components/HistorySidebar';

function App() {
    // Determine which sidebar content is active: 'config' | 'history'
    const [activeSidebar, setActiveSidebar] = useState<'config' | 'history'>('config');

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">
            {/* Resizable Sidebar Container */}
            <ResizableSidebar initialWidth={350} minWidth={300} maxWidth={600}>
                {activeSidebar === 'config' ? (
                    <>
                        <div className="p-6 border-b border-gray-100 bg-white">
                            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Domia</h1>
                            <p className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">Autonomous Web Agent</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-white">
                            <TestForm />
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50">
                            <button
                                onClick={() => setActiveSidebar('history')}
                                className="flex items-center justify-center space-x-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 hover:shadow-sm w-full p-2.5 rounded-md transition-all font-medium"
                            >
                                <span>📜</span>
                                <span>View History</span>
                            </button>
                            <p className="text-[10px] text-gray-400 mt-3 text-center">Configured via domia.config.json</p>
                        </div>
                    </>
                ) : (
                    <HistorySidebar onClose={() => setActiveSidebar('config')} />
                )}
            </ResizableSidebar>

            {/* Main Content - Execution & Logs */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50 min-w-0">
                {/* Top: Cinema Mode Viewport (60% height) */}
                <section className="flex-[3] relative border-b border-gray-200 bg-gray-100/50 p-6 overflow-hidden flex flex-col">
                    <LiveView />
                </section>

                {/* Bottom: Terminal Logs (40% height) */}
                <section className="flex-[2] bg-white flex flex-col overflow-hidden min-h-0">
                    <TestRunner />
                </section>
            </main>
        </div>
    );
}

export default App;
