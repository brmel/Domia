

import { useState, useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import type { DomiaConfig } from '../../shared/config-types';
import { cn } from '../../lib/utils';
import { Button } from './ui/Button';

interface SettingsSidebarProps {
    onClose: () => void;
    initialTab?: 'model' | 'debug';
    disabled?: boolean;
}

export function SettingsSidebar({ onClose, initialTab = 'model', disabled = false }: SettingsSidebarProps): JSX.Element {
    const utils = trpc.useUtils();
    const { data: config, isLoading } = trpc.settings.get.useQuery();
    const updateMutation = trpc.settings.update.useMutation({
        onSuccess: () => {
            // Optimistic update or just invalidate
            utils.settings.get.invalidate();
        }
    });

    const [activeTab, setActiveTab] = useState<'model' | 'debug'>(initialTab);

    // Update local state when initialTab changes
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const handleUpdate = (newConfig: DomiaConfig) => {
        updateMutation.mutate(newConfig);
    };



    const updateMaxSteps = (steps: number, e: React.ChangeEvent): void => {
        e.stopPropagation();
        if (!config) return;
        handleUpdate({
            ...config,
            limits: { ...(config.limits || {}), maxSteps: steps }
        });
    };

    const toggleHeadless = (enabled: boolean, e: React.ChangeEvent): void => {
        e.stopPropagation();
        if (!config) return;
        handleUpdate({
            ...config,
            headless: enabled // boolean, no nested spread needed
        });
    };

    // Helper to update strategy order safely
    // Since this is called from onChange, we can pass event too
    const updateStrategies = (newOrder: ('fast' | 'semantic' | 'visual' | 'heuristic')[], e: React.ChangeEvent): void => {
        e.stopPropagation();
        if (!config) return;
        handleUpdate({
            ...config,
            selectorEngine: { ...(config.selectorEngine || {}), strategyOrder: newOrder }
        });
    };

    if (isLoading && !config) {
        return <div className="p-6 text-gray-500">Loading settings...</div>;
    }

    // Ensure config is not null for strict typing below (it won't be due to check above, but for TS)
    const effectiveConfig = config || ({} as DomiaConfig);

    const allStrategies = ['fast', 'semantic', 'visual', 'heuristic'] as const;
    const activeStrategies = effectiveConfig.selectorEngine?.strategyOrder || [];

    return (
        <div className={`flex flex-col h-full bg-white border-r border-gray-200 shadow-xl animate-slide-in-right ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center space-x-2">
                    <span className="text-xl">{activeTab === 'model' ? '🧠' : '🛠️'}</span>
                    <h2 className="font-semibold text-gray-800">{activeTab === 'model' ? 'Model Settings' : 'Debug Tools'}</h2>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    disabled={disabled}
                >
                    ✕
                </Button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('model')}
                    disabled={disabled}
                    className={cn(
                        "flex-1 py-3 text-sm font-medium transition-colors relative",
                        activeTab === 'model' ? "text-blue-600" : "text-gray-500 hover:text-gray-700",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    Model & AI
                    {activeTab === 'model' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
                </button>
                <button
                    onClick={() => setActiveTab('debug')}
                    disabled={disabled}
                    className={cn(
                        "flex-1 py-3 text-sm font-medium transition-colors relative",
                        activeTab === 'debug' ? "text-purple-600" : "text-gray-500 hover:text-gray-700",
                        disabled && "opacity-50 cursor-not-allowed"
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
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-4">
                                {/* Vision LLM Toggle */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-medium text-gray-900">Visual LLM Analysis</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Allow the agent to "see" the page using Vision models.
                                            <span className="block text-blue-600 mt-1 font-medium text-[10px]">* Requires Screenshots to be enabled.</span>
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={effectiveConfig.ai?.visionEnabled ?? false}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                const enabled = e.target.checked;
                                                const updates: any = { visionEnabled: enabled };
                                                // Enforce dependency: If enabling vision, must enable screenshots
                                                if (enabled) {
                                                    updates.debugScreenshots = true;
                                                }
                                                if (!config) return;
                                                handleUpdate({
                                                    ...config,
                                                    ai: { ...(config.ai || {}), ...updates }
                                                });
                                            }}
                                            disabled={disabled}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                {/* Debug Screenshots Toggle */}
                                <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                                    <div>
                                        <h4 className="font-medium text-gray-900">Capture Screenshots</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Save screenshots for debugging and inspection history.
                                        </p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={effectiveConfig.ai?.debugScreenshots ?? false}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                const enabled = e.target.checked;
                                                const updates: any = { debugScreenshots: enabled };
                                                // Enforce dependency: If disabling screenshots, must disable vision
                                                if (!enabled) {
                                                    updates.visionEnabled = false;
                                                }
                                                if (!config) return;
                                                handleUpdate({
                                                    ...config,
                                                    ai: { ...(config.ai || {}), ...updates }
                                                });
                                            }}
                                            disabled={disabled}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gray-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-600"></div>
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
                                        value={effectiveConfig.limits?.maxSteps ?? 20}
                                        onChange={(e) => updateMaxSteps(parseInt(e.target.value), e)}
                                        disabled={disabled}
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
                                            checked={effectiveConfig.headless ?? true}
                                            onChange={(e) => toggleHeadless(e.target.checked, e)}
                                            disabled={disabled}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
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
                                                        updateStrategies([...activeStrategies, strategy], e);
                                                    } else {
                                                        updateStrategies(activeStrategies.filter(s => s !== strategy), e);
                                                    }
                                                }}
                                                disabled={disabled}
                                                className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                                            />
                                            <span className="text-sm font-medium text-gray-700 capitalize">{strategy} Path</span>
                                            {strategy === 'visual' && !effectiveConfig.ai?.visionEnabled && (
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

            {/* Saving Indicator - Subtle */}
            {updateMutation.isPending && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-3 py-1 rounded-full shadow-lg opacity-80 animate-pulse">
                    Saving...
                </div>
            )}
        </div>
    );
}
