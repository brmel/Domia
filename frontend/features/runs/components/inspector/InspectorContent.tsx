import { useState } from 'react';
import { SegmentedControl } from '@frontend/ui/SegmentedControl';
import type { StepArtifacts } from '@domain/ports/IStorageService';
import type { Step } from '@domain/ports/IRunRepository';
import type { StepTrace } from '@domain/ports/ITraceService';
import { TabPanel } from './inspectorPrimitives';
import { SummaryTab } from './SummaryTab';
import { VisionTab } from './VisionTab';
import { ContextTab } from './ContextTab';
import { RawTab } from './RawTab';

export interface InspectorContentProps {
    beforeArtifacts: StepArtifacts;
    afterArtifacts: StepArtifacts;
    stepDetail: Step | undefined;
}

export function InspectorContent({ beforeArtifacts, afterArtifacts, stepDetail }: InspectorContentProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<'summary' | 'vision' | 'context' | 'raw'>('summary');

    const trace = afterArtifacts.trace as (Record<string, unknown> & Partial<StepTrace>) | undefined;

    const tabs = [
        { id: 'summary', label: 'Summary', icon: '⚡' },
        { id: 'vision', label: 'Vision', icon: '👁️' },
        { id: 'context', label: 'Context', icon: '🌳' },
        { id: 'raw', label: 'Raw', icon: '{ }' },
    ] as const;

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
                <SegmentedControl
                    items={tabs.map((tab) => ({
                        value: tab.id,
                        label: `${tab.icon} ${tab.label}`
                    }))}
                    value={activeTab}
                    onChange={setActiveTab}
                    className="bg-gray-100"
                    activeItemClassName="bg-blue-50 text-blue-700"
                />
            </div>

            <div className="flex-1 overflow-hidden relative">
                <TabPanel id="summary" activeTab={activeTab}>
                    <SummaryTab stepDetail={stepDetail} beforeScreenshot={afterArtifacts.screenshots?.[0] ?? beforeArtifacts.screenshots?.[0]} />
                </TabPanel>
                <TabPanel id="vision" activeTab={activeTab}>
                    <VisionTab beforeScreenshots={beforeArtifacts.screenshots} currentScreenshots={afterArtifacts.screenshots} />
                </TabPanel>
                <TabPanel id="context" activeTab={activeTab} overflow={false}>
                    <ContextTab dom={afterArtifacts.dom ?? beforeArtifacts.dom} accessibility={afterArtifacts.accessibility ?? beforeArtifacts.accessibility} />
                </TabPanel>
                <TabPanel id="raw" activeTab={activeTab}>
                    <RawTab trace={trace} stepDetail={stepDetail} afterArtifacts={afterArtifacts} />
                </TabPanel>
            </div>
        </div>
    );
}
