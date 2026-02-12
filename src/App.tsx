import { TestForm } from './presentation/components/TestForm';
import { TestRunner } from './presentation/components/TestRunner';
import { LiveView } from './presentation/components/LiveView';
import { ResizableSidebar } from './presentation/components/ResizableSidebar';
import { useTestRunStore } from './presentation/stores';
import { canInteract } from './presentation/utils/agentStateUtils';

import { useState } from 'react';
import { HistorySidebar } from './presentation/components/HistorySidebar';
import { SettingsSidebar } from './presentation/components/SettingsSidebar';
import { StepInspector } from './presentation/components/StepInspector';


function App(): JSX.Element {
    // Determine which sidebar content is active: 'config' | 'history' | 'settings_model' | 'settings_debug'
    const [activeSidebar, setActiveSidebar] = useState<'config' | 'history' | 'settings_model' | 'settings_debug'>('config');
    const { status } = useTestRunStore();
    const isInteractionDisabled = !canInteract(status);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">
            {/* Resizable Sidebar Container */}
            <ResizableSidebar initialWidth={350} minWidth={300} maxWidth={600}>
                {activeSidebar === 'config' ? (
                    <>
                        <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
                            <h1 className="text-xl font-bold tracking-tight text-gray-900">Domia</h1>
                        </div>
                        <div className="flex-1 overflow-y-auto p-0 bg-white">
                            <TestForm
                                onOpenHistory={() => setActiveSidebar('history')}
                                onOpenModelSettings={() => setActiveSidebar('settings_model')}
                            />
                        </div>
                    </>
                ) : activeSidebar === 'history' ? (
                    <HistorySidebar
                        onClose={() => setActiveSidebar('config')}
                        disabled={isInteractionDisabled}
                    />
                ) : (
                    <SettingsSidebar
                        onClose={() => setActiveSidebar('config')}
                        initialTab={activeSidebar === 'settings_model' ? 'model' : 'debug'}
                        disabled={isInteractionDisabled}
                    />
                )}
            </ResizableSidebar>

            {/* Main Content - Execution & Logs */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50 min-w-0">
                {/* Top: Cinema Mode Viewport (50% height) */}
                <section className="flex-3 relative border-b border-gray-200 bg-gray-100/50 p-6 overflow-hidden flex flex-col">
                    <LiveView />
                </section>

                {/* Bottom: Terminal Logs (40% height -> 50%) */}
                <section className="flex-3 bg-white flex flex-col overflow-hidden min-h-0">
                    <TestRunner />
                </section>
            </main>
            <StepInspector />
        </div >
    );
}

export default App;
