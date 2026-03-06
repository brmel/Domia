
import { useState } from 'react';
import { useRunStore } from '../../stores';
import { trpc } from '../../trpc';
import { Button } from '../ui/Button';
import { RunState } from '@domain/enums/RunState';
import { canStart, canPause, canResume, canStop, isAgentRunning } from '../../utils/agentStateUtils';
import { PlatformSelector } from '../platform/PlatformSelector';
import { platformRegistry, type PlatformFieldValue, type UIPlatformType } from '../../config/platformRegistry';
import { buildPlatformConfig } from '../../utils/buildPlatformConfig';

interface RunFormProps {
    onOpenHistory: () => void;
    onOpenDebugSettings: () => void;
}

export function RunForm({ onOpenHistory, onOpenDebugSettings }: RunFormProps): React.ReactElement {
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
    } = useRunStore();
    const isRunning = isAgentRunning(status);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const runMutation = trpc.run.run.useMutation({
        onError: () => setStatus(RunState.FAILED),
    });

    const cancelMutation = trpc.run.cancel.useMutation({
        onError: () => setStatus(RunState.IDLE),
    });

    const pauseMutation = trpc.run.pause.useMutation({
        onError: () => setStatus(RunState.RUNNING),
    });

    const resumeMutation = trpc.run.resume.useMutation({
        onError: () => setStatus(RunState.PAUSED),
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

    const updateAiSettings = (updates: { visionEnabled?: boolean; debugScreenshots?: boolean }): void => {
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

    const handlePlatformChange = (newPlatform: UIPlatformType): void => {
        setSelectedPlatform(newPlatform);
        setPlatformData(platformRegistry[newPlatform].defaultValues);
        setFieldErrors({});
    };

    const handleFieldChange = (newData: PlatformFieldValue): void => {
        setPlatformData(newData);
        if (Object.keys(fieldErrors).length > 0) setFieldErrors({});
    };

    const onSubmit = (e: React.FormEvent): void => {
        e.preventDefault();

        const errors = platformRegistry[selectedPlatform].validate(platformData);
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }
        setFieldErrors({});

        if (!canStart(status) || !prompt.trim()) return;

        const platformConfig = buildPlatformConfig(selectedPlatform, platformData);

        setStatus(RunState.RUNNING);
        runMutation.mutate({
            platformConfig,
            prompt,
            options: {
                maxSteps: 20,
                vision: config?.ai?.visionEnabled ?? true,
                debugScreenshots: config?.ai?.debugScreenshots ?? false,
            }
        });
    };

    const handleStop = (): void => {
        setStatus(RunState.CANCELLED);
        cancelMutation.mutate();
    };

    const handlePause = (): void => {
        setStatus(RunState.PAUSED);
        pauseMutation.mutate();
    };

    const handleResume = (): void => {
        setStatus(RunState.RUNNING);
        resumeMutation.mutate();
    };

    const canSubmit = prompt.trim().length > 0 && !isRunning;
    const platformDefinition = platformRegistry[selectedPlatform];
    const PlatformFields = platformDefinition.renderFields;
    const visionEnabled = config?.ai?.visionEnabled ?? false;
    const screenshotsEnabled = config?.ai?.debugScreenshots ?? false;

    const handleVisionToggle = (enabled: boolean): void => {
        updateAiSettings({
            visionEnabled: enabled,
            debugScreenshots: enabled ? true : screenshotsEnabled,
        });
    };

    const handleScreenshotsToggle = (enabled: boolean): void => {
        if (!enabled && visionEnabled) return;
        updateAiSettings({ debugScreenshots: enabled });
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
                                <Button variant="secondary" onClick={handlePause} disabled={pauseMutation.isPending}>
                                    Pause
                                </Button>
                            ) : canResume(status) ? (
                                <Button variant="primary" onClick={handleResume} disabled={resumeMutation.isPending}>
                                    Resume
                                </Button>
                            ) : null}

                            {canStop(status) && (
                                <Button variant="danger" onClick={handleStop} disabled={cancelMutation.isPending}>
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
            </aside>
        </form>
    );
}
