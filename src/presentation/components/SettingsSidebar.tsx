

import { useState, useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import type { DomiaConfig } from '../../shared/config-types';
import { cn } from '../../lib/utils';

interface SettingsSidebarProps {
    onClose: () => void;
    initialTab?: 'model' | 'debug';
}

export function SettingsSidebar({ onClose, initialTab = 'model' }: SettingsSidebarProps): JSX.Element {
    const utils = trpc.useUtils();
    const { data: config, isLoading } = trpc.settings.get.useQuery();
    const updateMutation = trpc.settings.update.useMutation({
        onSuccess: () => {
            utils.settings.get.invalidate();
        }
    });

    const [activeTab, setActiveTab] = useState<'model' | 'debug'>(initialTab);
    const [localConfig, setLocalConfig] = useState<DomiaConfig | null>(null);

    useEffect(() => {
        if (config) {
            setLocalConfig(config);
        }
    }, [config]);

    // Update local state when initialTab changes from props (if the sidebar is re-opened)
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const handleSave = (): void => {
        if (localConfig) {
            updateMutation.mutate(localConfig);
        }
    };

    const toggleVision = (enabled: boolean): void => {
        if (!localConfig) return;
        setLocalConfig({
            ...localConfig,
            ai: { ...localConfig.ai, visionEnabled: enabled }
        });
    };

    // Helper to update strategy order safely
    const updateStrategies = (newOrder: ('fast' | 'semantic' | 'visual' | 'heuristic')[]): void => {
        if (!localConfig) return;
        setLocalConfig({
            ...localConfig,
            selectorEngine: { ...localConfig.selectorEngine, strategyOrder: newOrder }
        });
    };

    if (isLoading || !localConfig) {
        return <div className="p-6 text-gray-500">Loading settings...</div>;
    }

    const allStrategies = ['fast', 'semantic', 'visual', 'heuristic'] as const;
    const activeStrategies = localConfig.selectorEngine?.strategyOrder || [];

    return (
        <div className="flex flex-col h-full bg-white border-r border-gray-200 shadow-xl animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center space-x-2">
                    <span className="text-xl">{activeTab === 'model' ? '🧠' : '🛠️'}</span>
                    <h2 className="font-semibold text-gray-800">{activeTab === 'model' ? 'Model Settings' : 'Debug Tools'}</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-200 rounded-md transition-colors text-gray-400 hover:text-gray-600"
                >
                    ✕
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('model')}
                    className={cn(
                        "flex-1 py-3 text-sm font-medium transition-colors relative",
                        activeTab === 'model' ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
                    )}
                >
                    Model & AI
                    {activeTab === 'model' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
                </button>
                <button
                    onClick={() => setActiveTab('debug')}
                    className={cn(
                        "flex-1 py-3 text-sm font-medium transition-colors relative",
                        activeTab === 'debug' ? "text-purple-600" : "text-gray-500 hover:text-gray-700"
                    )}
                >
                    Debug & Trace
                    {activeTab === 'debug' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600" />}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {activeTab === 'model' && (
                    <>
                        {/* Vision LLM Section */}
                        <section>
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">AI Perception</h3>
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-medium text-gray-900">Vision Capabilites</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Enable multimodal analysis (screenshots).
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={localConfig.ai?.visionEnabled ?? false}
                                            onChange={(e) => toggleVision(e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                            </div>
                        </section>

                        {/* Limits Section */}
                        <section>
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Execution Limits</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Steps</label>
                                    <input
                                        type="number"
                                        value={localConfig.limits?.maxSteps ?? 20}
                                        onChange={(e) => setLocalConfig({
                                            ...localConfig,
                                            limits: { ...localConfig.limits, maxSteps: parseInt(e.target.value) }
                                        })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Maximum actions before stopping.</p>
                                </div>
                            </div>
                        </section>
                    </>
                )}

                {activeTab === 'debug' && (
                    <>
                        {/* Browser Control */}
                        <section>
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Browser Control</h3>
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-medium text-gray-900">Headless Mode</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Run without visual browser window.
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={localConfig.headless ?? true}
                                            onChange={(e) => setLocalConfig({
                                                ...localConfig,
                                                headless: e.target.checked
                                            })}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>
                            </div>
                        </section>

                        {/* Selector Engine Section */}
                        <section>
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Selector Engine</h3>
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
                                <p className="text-xs text-gray-500 mb-2">
                                    Strategy Priority Order
                                </p>
                                {allStrategies.map(strategy => {
                                    const isEnabled = activeStrategies.includes(strategy);
                                    return (
                                        <div key={strategy} className="flex items-center space-x-3 p-2 bg-white border border-gray-200 rounded shadow-sm">
                                            <input
                                                type="checkbox"
                                                checked={isEnabled}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        updateStrategies([...activeStrategies, strategy]);
                                                    } else {
                                                        updateStrategies(activeStrategies.filter(s => s !== strategy));
                                                    }
                                                }}
                                                className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                                            />
                                            <span className="text-sm font-medium text-gray-700 capitalize">{strategy} Path</span>
                                            {strategy === 'visual' && !localConfig.ai?.visionEnabled && (
                                                <span className="text-[10px] text-red-500 ml-auto">(Requires Vision)</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
                <button
                    onClick={() => setLocalConfig(config || null)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                    Reset
                </button>
                <button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className={cn(
                        "px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md disabled:opacity-50",
                        activeTab === 'model' ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700"
                    )}
                >
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
            {updateMutation.isSuccess && (
                <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-green-800 text-white text-xs px-3 py-1 rounded-full shadow-lg">
                    Settings Saved!
                </div>
            )}
        </div>
    );
}
