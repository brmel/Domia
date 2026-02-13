import React from 'react';
import { ResizableSidebar } from './ResizableSidebar';
import { TestForm } from './TestForm';
import { HistorySidebar } from './HistorySidebar';
import { SettingsSidebar } from './SettingsSidebar';
import { AppSectionPlaceholder } from './AppSectionPlaceholder';

export type SidebarMode = 'config' | 'history' | 'settings_model' | 'settings_debug';

interface ComposeWorkspaceProps {
    activeSidebar: SidebarMode;
    setActiveSidebar: (value: SidebarMode) => void;
    isInteractionDisabled: boolean;
}

export function ComposeWorkspace({ activeSidebar, setActiveSidebar, isInteractionDisabled }: ComposeWorkspaceProps): React.ReactElement {
    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
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

            <main className="flex-1 min-w-0 bg-gray-50">
                <AppSectionPlaceholder
                    title="Compose Workspace"
                    description="Use the left authoring panel to configure and start runs. Switch to Runs for live supervision, checkpoints, and safety diagnostics."
                    nextSteps={[
                        'Author prompt and target in the left panel.',
                        'Start the run, then open Runs for execution monitoring.',
                        'Use History and Settings from Compose sidebar controls.'
                    ]}
                />
            </main>
        </div>
    );
}
