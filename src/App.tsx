import { useTestRunStore } from './presentation/stores';
import { canInteract } from './presentation/utils/agentStateUtils';

import { useState } from 'react';
import { AppSectionPlaceholder } from './presentation/components/AppSectionPlaceholder';
import { SegmentedControl } from './presentation/components/ui/SegmentedControl';
import { RunsWorkspace } from './presentation/components/RunsWorkspace';
import { ComposeWorkspace } from './presentation/components/ComposeWorkspace';
import { WorkflowWorkspace } from './presentation/components/WorkflowWorkspace';

type AppSection = 'runs' | 'compose' | 'workflow' | 'skills' | 'plugins' | 'governance' | 'observability';

const SECTION_TABS: ReadonlyArray<{ id: AppSection; label: string }> = [
    { id: 'runs', label: 'Runs' },
    { id: 'compose', label: 'Compose' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'skills', label: 'Skills · Not available' },
    { id: 'plugins', label: 'Plugins · Not available' },
    { id: 'governance', label: 'Governance · Not available' },
    { id: 'observability', label: 'Observability · Not available' }
];


function App(): JSX.Element {
    // Determine which sidebar content is active: 'config' | 'history' | 'settings_model' | 'settings_debug'
    const [activeSidebar, setActiveSidebar] = useState<'config' | 'history' | 'settings_model' | 'settings_debug'>('config');
    const [activeSection, setActiveSection] = useState<AppSection>('runs');
    const { status } = useTestRunStore();
    const isInteractionDisabled = !canInteract(status);

    const renderPlaceholder = (section: Exclude<AppSection, 'runs'>): JSX.Element => {
        if (section === 'compose') {
            return (
                <ComposeWorkspace
                    activeSidebar={activeSidebar}
                    setActiveSidebar={setActiveSidebar}
                    isInteractionDisabled={isInteractionDisabled}
                />
            );
        }

        if (section === 'workflow') {
            return <WorkflowWorkspace />;
        }

        if (section === 'skills') {
            return (
                <AppSectionPlaceholder
                    title="Skills"
                    unavailable
                    description="Skills will host reusable execution patterns with trust-aware governance and lifecycle management."
                    nextSteps={[
                        'Add registry table (id, version, trust, last used).',
                        'Add skill details (schema, preconditions, postconditions).',
                        'Add promotion workflow from draft to verified.'
                    ]}
                />
            );
        }

        if (section === 'plugins') {
            return (
                <AppSectionPlaceholder
                    title="Plugins"
                    unavailable
                    description="Plugins will provide capability-first operations across SSH, filesystem, and device connectors with policy and approval controls."
                    nextSteps={[
                        'Add plugin catalog with trust and capability matrix.',
                        'Add policy decision visibility per invocation.',
                        'Add runtime controls for rate limit and kill switch.'
                    ]}
                />
            );
        }

        if (section === 'governance') {
            return (
                <AppSectionPlaceholder
                    title="Governance"
                    unavailable
                    description="Governance will centralize allow/deny/escalate policies and approval workflows for high-risk operations."
                    nextSteps={[
                        'Add versioned policy editor for tools, skills, and plugins.',
                        'Add decision simulator for hypothetical requests.',
                        'Add approval queue for escalated actions.'
                    ]}
                />
            );
        }

        return (
            <AppSectionPlaceholder
                title="Observability"
                unavailable
                description="Observability will provide run reliability, performance, and policy telemetry with drill-down diagnostics."
                nextSteps={[
                    'Add pass rate and duration trend panels.',
                    'Add retry, token, and temporal overhead views.',
                    'Add exportable audit trail filters.'
                ]}
            />
        );
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

                <div className="flex-1 min-h-0">
                    {activeSection === 'runs' ? <RunsWorkspace /> : renderPlaceholder(activeSection)}
                </div>
            </div>
        </div>
    );
}

export default App;
