import React from 'react';
import { LiveView } from './LiveView';
import { TestRunner } from './TestRunner';

export function RunsWorkspace(): React.ReactElement {
    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            <main className="flex-1 flex h-full overflow-hidden bg-gray-50 min-w-0 gap-4 p-6">
                <section
                    className="relative min-w-0 rounded-xl border border-gray-200 bg-gray-100/50 overflow-hidden flex flex-col"
                    style={{ flex: '0 0 70%' }}
                >
                    <LiveView />
                </section>

                <section
                    className="min-w-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden min-h-0"
                    style={{ flex: '0 0 30%' }}
                >
                    <TestRunner />
                </section>
            </main>
        </div>
    );
}
