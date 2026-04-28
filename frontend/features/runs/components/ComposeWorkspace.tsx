import React from 'react';
import { ResizableSidebar } from './ResizableSidebar';
import { RunForm } from './RunForm';
import { HistorySidebar } from './HistorySidebar';
import { SettingsSidebar } from './SettingsSidebar';

type SidebarMode = 'config' | 'history' | 'settings_debug';

interface ComposeWorkspaceProps {
    activeSidebar: SidebarMode;
    setActiveSidebar: (value: SidebarMode) => void;
    isInteractionDisabled: boolean;
}

export function ComposeWorkspace({ activeSidebar, setActiveSidebar, isInteractionDisabled }: ComposeWorkspaceProps): React.ReactElement {
    if (activeSidebar === 'history') {
        return (
            <div className="h-full min-h-0 overflow-hidden bg-white">
                <main className="flex-1 min-w-0">
                    <HistorySidebar
                        onClose={() => setActiveSidebar('config')}
                        disabled={isInteractionDisabled}
                    />
                </main>
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 flex overflow-hidden bg-gray-50">
            {activeSidebar === 'settings_debug' ? (
                <ResizableSidebar initialWidth={360} minWidth={320} maxWidth={600}>
                    <SettingsSidebar
                        onClose={() => setActiveSidebar('config')}
                        disabled={isInteractionDisabled}
                    />
                </ResizableSidebar>
            ) : null}

            <main className="flex-1 min-w-0 p-4">
                <div className="h-full rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <RunForm
                        onOpenHistory={() => setActiveSidebar('history')}
                        onOpenDebugSettings={() => setActiveSidebar('settings_debug')}
                    />
                </div>
            </main>
        </div>
    );
}
