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
import { AppSectionPlaceholder } from './presentation/components/AppSectionPlaceholder';
import { SegmentedControl } from './presentation/components/ui/SegmentedControl';

type AppSection = 'runs' | 'compose' | 'skills' | 'plugins' | 'governance' | 'observability';

const SECTION_TABS: ReadonlyArray<{ id: AppSection; label: string }> = [
    { id: 'runs', label: 'Runs' },
    { id: 'compose', label: 'Compose' },
    { id: 'skills', label: 'Skills' },
    { id: 'plugins', label: 'Plugins' },
    { id: 'governance', label: 'Governance' },
    { id: 'observability', label: 'Observability' }
];


function App(): JSX.Element {
    // Determine which sidebar content is active: 'config' | 'history' | 'settings_model' | 'settings_debug'
    const [activeSidebar, setActiveSidebar] = useState<'config' | 'history' | 'settings_model' | 'settings_debug'>('config');
    const [activeSection, setActiveSection] = useState<AppSection>('runs');
    const { status } = useTestRunStore();
    const isInteractionDisabled = !canInteract(status);

    const renderRunsWorkspace = (): JSX.Element => (
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

            <main className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50 min-w-0">
                <section className="flex-3 relative border-b border-gray-200 bg-gray-100/50 p-6 overflow-hidden flex flex-col">
                    <LiveView />
                </section>

                <section className="flex-3 bg-white flex flex-col overflow-hidden min-h-0">
                    <TestRunner />
                </section>
            </main>
            <StepInspector />
        </div>
    );

    const renderPlaceholder = (section: Exclude<AppSection, 'runs'>): JSX.Element => {
        if (section === 'compose') {
            return (
                <AppSectionPlaceholder
                    title="Compose"
                    description="Compose will become the dedicated authoring workspace for prompts, target configuration, and advanced run options with readiness preview before start."
                    nextSteps={[
                        'Extract authoring controls from Runs into a standalone compose workflow.',
                        'Add collapsed advanced options for temporal, recovery, skills, and plugin preflight.',
                        'Add pre-run readiness hints in observe mode.'
                    ]}
                />
            );
        }

        if (section === 'skills') {
            return (
                <AppSectionPlaceholder
                    title="Skills"
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
                    {activeSection === 'runs' ? renderRunsWorkspace() : renderPlaceholder(activeSection)}
                </div>
            </div>
        </div>
    );
}

export default App;
