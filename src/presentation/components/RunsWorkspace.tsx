import React from 'react';
import { LiveView } from './LiveView';
import { TestRunner } from './TestRunner';
import { StepInspector } from './StepInspector';

export function RunsWorkspace(): React.ReactElement {
    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
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
}
