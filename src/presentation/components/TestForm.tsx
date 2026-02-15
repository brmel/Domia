
import { useState } from 'react';
import { useTestRunStore } from '../stores';
import { trpc } from '../../lib/trpc';
import { Button } from './ui/Button';
import { AgentStatus } from '../../domain/types/AgentStatus';
import { canStart, canPause, canResume, canStop, isAgentRunning } from '../utils/agentStateUtils';
import { PlatformSelector } from './PlatformSelector';
import { platformRegistry, type PlatformFieldValue } from '../config/platformRegistry';
import type { PlatformType, PlatformConfig, WebPlatformConfig, ElectronPlatformConfig } from '../../domain/types/PlatformConfig';

interface TestFormProps {
    onOpenHistory: () => void;
    onOpenDebugSettings: () => void;
}

export function TestForm({ onOpenHistory, onOpenDebugSettings }: TestFormProps): React.ReactElement {
    const utils = trpc.useUtils();
    const {
        status,
        setStatus,
        prompt,
        setPrompt,
        selectedPlatform,
        setSelectedPlatform,
        platformData,
        setPlatformData,
        temporalObservation,
        setTemporalObservation,
        temporalMode,
        setTemporalMode,
        temporalBaselineIntervalMs,
        setTemporalBaselineIntervalMs,
        temporalBurstIntervalMs,
        setTemporalBurstIntervalMs,
        temporalMaxFramesPerWindow,
        setTemporalMaxFramesPerWindow,
        temporalPromptTokenBudget,
        setTemporalPromptTokenBudget,
        temporalRedactSensitive,
        setTemporalRedactSensitive,
        temporalPersistWindow,
        setTemporalPersistWindow
    } = useTestRunStore();
    const isRunning = isAgentRunning(status);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const runMutation = trpc.test.run.useMutation({
        onError: (error) => {
            console.error('Failed to start test:', error);
            setStatus(AgentStatus.FAILED);
        },
        onSuccess: () => {
            // Status will be updated via IPC event 'started'
        }
    });

    const { data: config } = trpc.settings.get.useQuery();
    const updateSettingsMutation = trpc.settings.update.useMutation({
        onMutate: async (nextConfig) => {
            await utils.settings.get.cancel();
            const previousConfig = utils.settings.get.getData();
            utils.settings.get.setData(undefined, nextConfig);
            return { previousConfig };
        },
        onError: (_error, _nextConfig, context) => {
            if (context?.previousConfig) {
                utils.settings.get.setData(undefined, context.previousConfig);
            }
        },
        onSettled: () => {
            utils.settings.get.invalidate();
        }
    });

    const updateAiSettings = (updates: { visionEnabled?: boolean; debugScreenshots?: boolean }) => {
        if (!config) {
            return;
        }

        updateSettingsMutation.mutate({
            ...config,
            ai: {
                ...(config.ai || {}),
                ...updates
            }
        });
    };

    const handlePlatformChange = (newPlatform: PlatformType) => {
        setSelectedPlatform(newPlatform);
        const definition = platformRegistry[newPlatform];
        setPlatformData(definition.defaultValues);
        setFieldErrors({});
    };

    const handleFieldChange = (newData: PlatformFieldValue) => {
        setPlatformData(newData);
        if (Object.keys(fieldErrors).length > 0) {
            setFieldErrors({});
        }
    };

    const validatePlatformData = (platform: PlatformType, data: PlatformFieldValue): Record<string, string> => {
        const nextErrors: Record<string, string> = {};

        if (platform === 'web') {
            const webData = data as Omit<WebPlatformConfig, 'platform'>;
            const rawUrl = (webData.url || '').trim();
            if (!rawUrl) {
                nextErrors['url'] = 'URL is required';
                return nextErrors;
            }

            try {
                new URL(rawUrl);
            } catch {
                nextErrors['url'] = 'Enter a valid URL (https://...)';
            }

            return nextErrors;
        }

        const electronData = data as Omit<ElectronPlatformConfig, 'platform'>;
        const connection = electronData.connection;
        if (!connection) {
            nextErrors['connection.type'] = 'Connection is required';
            return nextErrors;
        }

        if (connection.type === 'cdp') {
            const cdpUrl = (connection.cdpUrl || '').trim();
            if (!cdpUrl) {
                nextErrors['connection.cdpUrl'] = 'CDP URL is required';
                return nextErrors;
            }

            try {
                new URL(cdpUrl);
            } catch {
                nextErrors['connection.cdpUrl'] = 'Enter a valid CDP URL';
            }

            return nextErrors;
        }

        const executablePath = (connection.executablePath || '').trim();
        if (!executablePath) {
            nextErrors['connection.executablePath'] = 'Executable path is required';
        }

        return nextErrors;
    };

    const buildPlatformConfig = (
        platform: PlatformType,
        fieldValue: PlatformFieldValue
    ): PlatformConfig => {
        switch (platform) {
            case 'web': {
                const webFields = fieldValue as Omit<WebPlatformConfig, 'platform'>;
                return {
                    platform: 'web',
                    url: webFields.url,
                };
            }
            case 'electron': {
                const electronFields = fieldValue as Omit<ElectronPlatformConfig, 'platform'>;
                return {
                    platform: 'electron',
                    connection: electronFields.connection,
                };
            }
            default: {
                const exhaustive: never = platform;
                throw new Error(`Unsupported platform: ${String(exhaustive)}`);
            }
        }
    };

    const onSubmit = (e: React.FormEvent): void => {
        e.preventDefault();

        const validationErrors = validatePlatformData(selectedPlatform, platformData);
        if (Object.keys(validationErrors).length > 0) {
            setFieldErrors(validationErrors);
            return;
        }
        setFieldErrors({});
        
        if (!canStart(status) || !prompt.trim()) {
            return;
        }

        // Build platform config
        const platformConfig = buildPlatformConfig(selectedPlatform, platformData);

        setStatus(AgentStatus.RUNNING);
        
        const finalData = {
            platformConfig,
            prompt,
            options: {
                maxSteps: 20,
                headless: false,
                verbose: true,
                debug: false,
                vision: config?.ai?.visionEnabled ?? true,
                debugScreenshots: config?.ai?.debugScreenshots ?? false,
                temporalObservation,
                temporalMode,
                temporalBaselineIntervalMs,
                temporalBurstIntervalMs,
                temporalMaxFramesPerWindow,
                temporalPromptTokenBudget,
                temporalRedactSensitive,
                temporalPersistWindow
            }
        };
        
        runMutation.mutate(finalData);
    };

    const stopMutation = trpc.test.cancel.useMutation({
        onError: (err) => console.error('Failed to stop test:', err)
    });

    const pauseMutation = trpc.test.pause.useMutation({
        onError: (err) => console.error('Failed to pause test:', err)
    });

    const resumeMutation = trpc.test.resume.useMutation({
        onError: (err) => console.error('Failed to resume test:', err)
    });

    const handleStop = (): void => {
        stopMutation.mutate();
        setStatus(AgentStatus.CANCELLED);
    };

    const handlePause = (): void => {
        pauseMutation.mutate();
        setStatus(AgentStatus.PAUSED);
    };

    const handleResume = (): void => {
        resumeMutation.mutate();
        setStatus(AgentStatus.RUNNING);
    };

    const canSubmit = prompt.trim().length > 0 && !isRunning;
    const platformDefinition = platformRegistry[selectedPlatform];
    const PlatformFields = platformDefinition.renderFields;
    const visionEnabled = config?.ai?.visionEnabled ?? false;
    const screenshotsEnabled = config?.ai?.debugScreenshots ?? false;

    const handleVisionToggle = (enabled: boolean): void => {
        updateAiSettings({
            visionEnabled: enabled,
            debugScreenshots: enabled ? true : screenshotsEnabled
        });
    };

    const handleScreenshotsToggle = (enabled: boolean): void => {
        if (!enabled && visionEnabled) {
            return;
        }

        updateAiSettings({
            debugScreenshots: enabled,
            visionEnabled: enabled ? visionEnabled : false
        });
    };

    return (
        <form className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]" onSubmit={onSubmit}>
            <section className="min-h-0 flex flex-col lg:border-r lg:border-gray-200">
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <PlatformSelector
                        value={selectedPlatform}
                        onChange={handlePlatformChange}
                        disabled={isRunning}
                    />

                    <div>
                        <PlatformFields
                            value={platformData}
                            onChange={handleFieldChange}
                            errors={fieldErrors}
                            disabled={isRunning}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Goal Instructions</label>
                        <textarea
                            className="w-full min-h-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Describe the task step-by-step..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            disabled={isRunning}
                        />
                    </div>
                </div>

                <div className="border-t border-gray-200 p-4 space-y-3 bg-white">
                    {canStart(status) && (
                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            className="w-full"
                            disabled={!canSubmit || runMutation.isPending}
                            isLoading={runMutation.isPending}
                        >
                            Start Agent
                        </Button>
                    )}

                    {isAgentRunning(status) && (
                        <div className="grid grid-cols-2 gap-3">
                            {canPause(status) ? (
                                <Button variant="secondary" onClick={handlePause}>
                                    Pause
                                </Button>
                            ) : canResume(status) ? (
                                <Button variant="primary" onClick={handleResume}>
                                    Resume
                                </Button>
                            ) : null}

                            {canStop(status) && (
                                <Button variant="danger" onClick={handleStop}>
                                    Stop
                                </Button>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <Button type="button" variant="secondary" onClick={onOpenHistory} disabled={isRunning}>
                            History
                        </Button>
                        <Button type="button" variant="outline" onClick={onOpenDebugSettings} disabled={isRunning}>
                            Debug
                        </Button>
                    </div>

                    <p className="text-center text-xs text-gray-500">
                        {isRunning ? 'Agent is working autonomously...' : 'Ready to run'}
                    </p>
                </div>
            </section>

            <aside className="min-h-0 overflow-y-auto bg-gray-50 p-5 space-y-4 border-t border-gray-200 lg:border-t-0">
                <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Model & AI</h3>

                    <label className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                        <span>Visual LLM Analysis</span>
                        <input
                            type="checkbox"
                            checked={visionEnabled}
                            onChange={(event) => handleVisionToggle(event.target.checked)}
                            disabled={isRunning || updateSettingsMutation.isPending}
                        />
                    </label>

                    <label className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                        <span>Capture Screenshots</span>
                        <input
                            type="checkbox"
                            checked={screenshotsEnabled}
                            onChange={(event) => handleScreenshotsToggle(event.target.checked)}
                            disabled={isRunning || updateSettingsMutation.isPending || visionEnabled}
                        />
                    </label>

                    {visionEnabled && (
                        <p className="text-xs text-gray-500">Disable Visual LLM first to turn off screenshots.</p>
                    )}
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Advanced Runtime Controls</h3>

                    <div className="space-y-3">
                        <label className="flex items-center justify-between text-sm text-gray-700">
                            <span>Temporal Observation</span>
                            <input
                                type="checkbox"
                                checked={temporalObservation}
                                onChange={(event) => setTemporalObservation(event.target.checked)}
                                disabled={isRunning}
                            />
                        </label>

                        <label className="flex flex-col gap-1 text-sm text-gray-700">
                            <span>Temporal Mode</span>
                            <select
                                value={temporalMode}
                                onChange={(event) => setTemporalMode(event.target.value as 'off' | 'baseline' | 'adaptive' | 'forensic')}
                                disabled={isRunning}
                                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                            >
                                <option value="off">Off</option>
                                <option value="baseline">Baseline</option>
                                <option value="adaptive">Adaptive</option>
                                <option value="forensic">Forensic</option>
                            </select>
                        </label>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="flex flex-col gap-1 text-sm text-gray-700">
                                <span>Baseline Interval (ms)</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={temporalBaselineIntervalMs}
                                    onChange={(event) => setTemporalBaselineIntervalMs(Math.max(1, Number(event.target.value || 1)))}
                                    disabled={isRunning}
                                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                />
                            </label>

                            <label className="flex flex-col gap-1 text-sm text-gray-700">
                                <span>Burst Interval (ms)</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={temporalBurstIntervalMs}
                                    onChange={(event) => setTemporalBurstIntervalMs(Math.max(1, Number(event.target.value || 1)))}
                                    disabled={isRunning}
                                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                />
                            </label>

                            <label className="flex flex-col gap-1 text-sm text-gray-700">
                                <span>Frames / Window</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={temporalMaxFramesPerWindow}
                                    onChange={(event) => setTemporalMaxFramesPerWindow(Math.max(1, Number(event.target.value || 1)))}
                                    disabled={isRunning}
                                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                />
                            </label>

                            <label className="flex flex-col gap-1 text-sm text-gray-700">
                                <span>Prompt Budget (tokens)</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={temporalPromptTokenBudget}
                                    onChange={(event) => setTemporalPromptTokenBudget(Math.max(1, Number(event.target.value || 1)))}
                                    disabled={isRunning}
                                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                                />
                            </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                <span>Redact Sensitive</span>
                                <input
                                    type="checkbox"
                                    checked={temporalRedactSensitive}
                                    onChange={(event) => setTemporalRedactSensitive(event.target.checked)}
                                    disabled={isRunning}
                                />
                            </label>

                            <label className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                <span>Persist Window</span>
                                <input
                                    type="checkbox"
                                    checked={temporalPersistWindow}
                                    onChange={(event) => setTemporalPersistWindow(event.target.checked)}
                                    disabled={isRunning}
                                />
                            </label>
                        </div>
                    </div>
                </section>
            </aside>
        </form>
    );
}
