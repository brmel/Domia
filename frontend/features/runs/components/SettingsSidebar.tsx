import { trpc } from '@frontend/api/trpc';
import type { DomiaConfig } from '@shared/contracts/config';
import { Button } from '@frontend/ui/Button';
import { FieldLabel } from '@frontend/ui/FieldLabel';
import { NumberField } from '@frontend/ui/NumberField';
import { PromptEditor } from './PromptEditor';

interface SettingsSidebarProps {
    onClose: () => void;
    disabled?: boolean;
}

const REPORT_FORMATS = ['none', 'junit', 'html', 'all'] as const;

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

    if (isLoading && !config) {
        return <div className="p-6 text-gray-500">Loading settings...</div>;
    }

    if (!config) {
        return <div className="p-6 text-red-500">Failed to load settings.</div>;
    }

    const cfg = config;

    const updateRuntime = (patch: Partial<Pick<DomiaConfig, 'headless' | 'viewMode'>> & { viewport?: Partial<DomiaConfig['viewport']>; limits?: Partial<DomiaConfig['limits']> }): void => {
        handleUpdate({
            ...cfg,
            ...patch,
            viewport: { ...cfg.viewport, ...(patch.viewport ?? {}) },
            limits: { ...cfg.limits, ...(patch.limits ?? {}) },
        });
    };

    const updateAi = (patch: Partial<DomiaConfig['ai']>): void => {
        handleUpdate({ ...cfg, ai: { ...cfg.ai, ...patch } });
    };

    const updatePaths = (patch: Partial<DomiaConfig['paths']>): void => {
        handleUpdate({ ...cfg, paths: { ...cfg.paths, ...patch } });
    };

    const updateReporting = (patch: Partial<DomiaConfig['reporting']>): void => {
        handleUpdate({ ...cfg, reporting: { ...cfg.reporting, ...patch } });
    };

    return (
        <div className={`flex flex-col h-full bg-white border-r border-gray-200 shadow-xl animate-slide-in-right ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center space-x-2">
                    <span className="text-xl">🛠️</span>
                    <h2 className="font-semibold text-gray-800">Debug & Trace</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose} disabled={disabled}>✕</Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <section>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Automation Control</h3>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium text-gray-900">View Mode</h4>
                                <p className="text-xs text-gray-500 mt-1">
                                    Embedded shows the browser in the live view. Detached opens a separate window.
                                </p>
                            </div>
                            <select
                                className="rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2 border bg-white"
                                value={cfg.viewMode}
                                onChange={(e) => updateRuntime({ viewMode: e.target.value as DomiaConfig['viewMode'], headless: e.target.value === 'embedded' ? true : cfg.headless })}
                                disabled={disabled}
                            >
                                <option value="embedded">Embedded</option>
                                <option value="detached">Detached</option>
                            </select>
                        </div>
                        {cfg.viewMode === 'detached' && (
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-medium text-gray-900">Headless Mode</h4>
                                    <p className="text-xs text-gray-500 mt-1">Run without visual window.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={cfg.headless} onChange={(e) => updateRuntime({ headless: e.target.checked })} disabled={disabled} />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                </label>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <NumberField label="Viewport Width" value={cfg.viewport.width} onChange={(width) => updateRuntime({ viewport: { width } })} disabled={disabled} />
                            <NumberField label="Viewport Height" value={cfg.viewport.height} onChange={(height) => updateRuntime({ viewport: { height } })} disabled={disabled} />
                        </div>
                    </div>
                </section>

                <section>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Execution Limits</h3>
                    <div className="space-y-4">
                        <NumberField label="Max Steps" value={cfg.limits.maxSteps} onChange={(maxSteps) => updateRuntime({ limits: { maxSteps } })} disabled={disabled} />
                        <NumberField label="Delay Between Steps (ms)" value={cfg.limits.delayBetweenSteps} onChange={(delayBetweenSteps) => updateRuntime({ limits: { delayBetweenSteps } })} disabled={disabled} />
                    </div>
                </section>

                <section>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">AI</h3>
                    <div className="space-y-4">
                        <div>
                            <FieldLabel>Provider</FieldLabel>
                            <input type="text" value={cfg.ai.provider} disabled className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border bg-gray-100 text-gray-600" />
                        </div>
                        <div>
                            <FieldLabel>Model</FieldLabel>
                            <input type="text" value={cfg.ai.model} onChange={(e) => updateAi({ model: e.target.value })} disabled={disabled} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
                        </div>
                        <div>
                            <FieldLabel>API Key</FieldLabel>
                            <input type="password" value={cfg.ai.apiKey ?? ''} onChange={(e) => updateAi({ apiKey: e.target.value || undefined })} disabled={disabled} placeholder="Set via env or here" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" />
                        </div>
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-gray-700">Vision Enabled</h4>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={cfg.ai.visionEnabled} onChange={(e) => updateAi({ visionEnabled: e.target.checked })} disabled={disabled} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                            </label>
                        </div>
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-gray-700">Debug Screenshots</h4>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={cfg.ai.debugScreenshots} onChange={(e) => updateAi({ debugScreenshots: e.target.checked })} disabled={disabled} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                            </label>
                        </div>
                    </div>
                </section>

                <section>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Paths</h3>
                    <div className="space-y-4">
                        <div>
                            <FieldLabel>Artifacts Directory</FieldLabel>
                            <input type="text" value={cfg.paths.artifactsDir} onChange={(e) => updatePaths({ artifactsDir: e.target.value })} disabled={disabled} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border font-mono text-xs" />
                        </div>
                        <div>
                            <FieldLabel>Database Path</FieldLabel>
                            <input type="text" value={cfg.paths.databasePath} onChange={(e) => updatePaths({ databasePath: e.target.value })} disabled={disabled} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border font-mono text-xs" />
                        </div>
                    </div>
                </section>

                <section>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Reporting</h3>
                    <div className="space-y-4">
                        <div>
                            <FieldLabel>Default Format</FieldLabel>
                            <select value={cfg.reporting.defaultFormat} onChange={(e) => updateReporting({ defaultFormat: e.target.value as DomiaConfig['reporting']['defaultFormat'] })} disabled={disabled} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white">
                                {REPORT_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                        <div>
                            <FieldLabel>Output Directory</FieldLabel>
                            <input type="text" value={cfg.reporting.outputDir} onChange={(e) => updateReporting({ outputDir: e.target.value })} disabled={disabled} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border font-mono text-xs" />
                        </div>
                    </div>
                </section>

                <section>
                    <PromptEditor disabled={disabled} />
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
