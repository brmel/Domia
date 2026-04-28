import { useEffect, useState } from 'react';
import { useRunStore } from '@frontend/features/runs/store';
import { canStart } from '@frontend/lib/agentStateUtils';
import { SegmentedControl } from '@frontend/ui/SegmentedControl';
import { RunsWorkspace } from '@frontend/features/runs/components/RunsWorkspace';
import { ComposeWorkspace } from '@frontend/features/runs/components/ComposeWorkspace';
import { WorkflowWorkspace } from '@frontend/features/workflows/components/WorkflowWorkspace';
import { PluginsWorkspace } from '@frontend/features/plugins/components/PluginsWorkspace';
import { SkillsWorkspace } from '@frontend/features/skills/components/SkillsWorkspace';
import { StepInspector } from '@frontend/features/runs/components/StepInspector';
import { RunState } from '@domain/enums';

type AppSection = 'runs' | 'compose' | 'workflow' | 'skills' | 'plugins';

const SECTION_TABS: ReadonlyArray<{ id: AppSection; label: string }> = [
    { id: 'runs', label: 'Runs' },
    { id: 'compose', label: 'Compose' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'skills', label: 'Skills' },
    { id: 'plugins', label: 'Plugins' },
];

function App(): JSX.Element {
    const [activeSidebar, setActiveSidebar] = useState<'config' | 'history' | 'settings_debug'>('config');
    const [activeSection, setActiveSection] = useState<AppSection>('runs');
    const { status } = useRunStore();
    const isInteractionDisabled = !canStart(status);

    useEffect(() => {
        if (
            activeSection === 'compose'
            && (status === RunState.RUNNING || status === RunState.PAUSED)
        ) {
            setActiveSection('runs');
        }
    }, [activeSection, status]);

    const renderSection = (): JSX.Element => {
        switch (activeSection) {
            case 'runs':
                return <RunsWorkspace />;
            case 'compose':
                return (
                    <ComposeWorkspace
                        activeSidebar={activeSidebar}
                        setActiveSidebar={setActiveSidebar}
                        isInteractionDisabled={isInteractionDisabled}
                    />
                );
            case 'workflow':
                return <WorkflowWorkspace />;
            case 'skills':
                return <SkillsWorkspace />;
            case 'plugins':
                return <PluginsWorkspace />;
        }
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">
            <div className="flex flex-col h-full w-full min-w-0">
                <header className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between">
                    <div className="text-sm font-bold tracking-tight text-gray-900">Domia Control Plane</div>
                    <nav>
                        <SegmentedControl
                            items={SECTION_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
                            value={activeSection}
                            onChange={setActiveSection}
                            className="rounded-lg"
                            itemClassName="px-3 py-1.5 text-xs"
                        />
                    </nav>
                </header>

                <div className="flex-1 min-h-0 h-full">
                    {renderSection()}
                </div>

                <StepInspector />
            </div>
        </div>
    );
}

export default App;
