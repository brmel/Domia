import { TestForm } from './presentation/components/TestForm';
import { TestRunner } from './presentation/components/TestRunner';
import { LiveView } from './presentation/components/LiveView';

function App() {
    return (
        <div className="grid grid-cols-[350px_1fr] h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">
            {/* Sidebar - Configuration */}
            <aside className="border-r border-gray-200 bg-white flex flex-col z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <div className="p-6 border-b border-gray-100">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Domia</h1>
                    <p className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">Autonomous Web Agent</p>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    <TestForm />
                </div>
            </aside>

            {/* Main Content - Execution & Logs */}
            <main className="flex flex-col h-screen overflow-hidden bg-gray-50/50">
                {/* Top: Cinema Mode Viewport (60% height) */}
                <section className="flex-[3] relative border-b border-gray-200 bg-gray-100/50 p-6 overflow-hidden flex flex-col">
                    <LiveView />
                </section>

                {/* Bottom: Terminal Logs (40% height) */}
                <section className="flex-[2] bg-white flex flex-col overflow-hidden min-h-0">
                    <TestRunner />
                </section>
            </main>
        </div>
    );
}

export default App;
