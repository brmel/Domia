import { trpc } from '../../lib/trpc';
import type { DomiaConfig } from '../../shared/config-types';
import { Button } from './ui/Button';

interface SettingsSidebarProps {
    onClose: () => void;
    disabled?: boolean;
}

export function SettingsSidebar({ onClose, disabled = false }: SettingsSidebarProps): JSX.Element {
    const utils = trpc.useUtils();
    const { data: config, isLoading } = trpc.settings.get.useQuery();
    const updateMutation = trpc.settings.update.useMutation({
        onSuccess: () => {
            utils.settings.get.invalidate();
        }
    });

    const handleUpdate = (newConfig: DomiaConfig): void => {
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

    const effectiveConfig = config || ({} as DomiaConfig);

    const allStrategies = ['fast', 'semantic', 'visual', 'heuristic'] as const;
    const activeStrategies = effectiveConfig.selectorEngine?.strategyOrder || [];

    return (
        <div className={`flex flex-col h-full bg-white border-r border-gray-200 shadow-xl animate-slide-in-right ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center space-x-2">
                    <span className="text-xl">🛠️</span>
                    <h2 className="font-semibold text-gray-800">Debug & Trace</h2>
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

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
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
                        </div>
                    </div>
                </section>

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
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>

            {updateMutation.isPending && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-3 py-1 rounded-full shadow-lg opacity-80 animate-pulse">
                    Saving...
                </div>
            )}
        </div>
    );
}
