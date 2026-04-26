import React from 'react';
import { LiveView } from './LiveView';
import { RunPanel } from './RunPanel';

export function RunsWorkspace(): React.ReactElement {
    return (
        <div className="h-full min-h-0 overflow-hidden">
            <main className="h-full min-h-0 grid overflow-hidden bg-gray-50 min-w-0 gap-4 p-6 grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
                <section
                    className="relative min-w-0 min-h-0 rounded-xl border border-gray-200 bg-gray-100/50 overflow-hidden flex flex-col"
                >
                    <LiveView />
                </section>

                <section
                    className="min-w-0 min-h-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden"
                >
                    <RunPanel />
                </section>
            </main>
        </div>
    );
}
