import { useState } from 'react';
import { useRunStore } from '@frontend/features/runs/store';
import { trpc } from '@frontend/api/trpc';
import { RunState } from '@domain/enums';
import { canStart, isAgentRunning } from '@frontend/lib/agentStateUtils';
import { platformRegistry, type PlatformFieldValue, type UIPlatformType } from '@frontend/lib/platformRegistry';
import { buildPlatformConfig } from '@frontend/lib/buildPlatformConfig';
import { DomiaConfigSchema } from '@shared/contracts/config';
import { logger } from '@frontend/lib/logger';

/** All RunForm orchestration: store state, tRPC mutations, settings, submit/control handlers.
 *  Keeps RunForm.tsx pure-render. */
export function useRunForm() {
    const utils = trpc.useUtils();
    const {
        status, setStatus, prompt, setPrompt,
        selectedPlatform, setSelectedPlatform, platformData, setPlatformData,
        handleRunOutput,
    } = useRunStore();
    const isRunning = isAgentRunning(status);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [recordingEnabled, setRecordingEnabled] = useState<boolean>(false);

    const runMutation = trpc.run.run.useMutation({
        onError: (err) => {
            logger.error({ err: err.message }, '[RunForm] mutation error');
            handleRunOutput({
                type: 'error',
                error: { name: 'TRPCClientError', message: err.message } as unknown as Error,
            });
        },
    });
    const cancelMutation = trpc.run.cancel.useMutation({ onError: () => setStatus(RunState.RUNNING) });
    const pauseMutation = trpc.run.pause.useMutation({ onError: () => setStatus(RunState.RUNNING) });
    const resumeMutation = trpc.run.resume.useMutation({ onError: () => setStatus(RunState.PAUSED) });

    const { data: config } = trpc.settings.get.useQuery();
    const updateSettingsMutation = trpc.settings.update.useMutation({
        onMutate: async (nextConfig) => {
            await utils.settings.get.cancel();
            const previousConfig = utils.settings.get.getData();
            utils.settings.get.setData(undefined, DomiaConfigSchema.parse(nextConfig) as NonNullable<typeof previousConfig>);
            return { previousConfig };
        },
        onError: (_error, _nextConfig, context) => {
            if (context?.previousConfig) utils.settings.get.setData(undefined, context.previousConfig);
        },
        onSettled: () => { utils.settings.get.invalidate(); },
    });

    const updateAiSettings = (updates: { visionEnabled?: boolean; debugScreenshots?: boolean }): void => {
        if (!config) return;
        updateSettingsMutation.mutate({ ...config, ai: { ...(config.ai || {}), ...updates } });
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
        if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
        setFieldErrors({});
        if (!canStart(status) || !prompt.trim()) return;
        const platformConfig = buildPlatformConfig(selectedPlatform, platformData);
        setStatus(RunState.RUNNING);
        runMutation.mutate({
            platformConfig,
            prompt,
            options: {
                maxSteps: config?.limits?.maxSteps ?? 20,
                vision: config?.ai?.visionEnabled ?? true,
                debugScreenshots: config?.ai?.debugScreenshots ?? false,
                ...(recordingEnabled ? { recording: true } : {}),
            },
        });
    };

    const handleStop = (): void => { setStatus(RunState.CANCELLED); cancelMutation.mutate(); };
    const handlePause = (): void => { setStatus(RunState.PAUSED); pauseMutation.mutate(); };
    const handleResume = (): void => { setStatus(RunState.RUNNING); resumeMutation.mutate(); };

    const canSubmit = prompt.trim().length > 0 && !isRunning;
    const platformDefinition = platformRegistry[selectedPlatform];
    const visionEnabled = config?.ai?.visionEnabled ?? false;
    const screenshotsEnabled = config?.ai?.debugScreenshots ?? false;

    const handleVisionToggle = (enabled: boolean): void => {
        updateAiSettings({ visionEnabled: enabled, debugScreenshots: enabled ? true : screenshotsEnabled });
    };
    const handleScreenshotsToggle = (enabled: boolean): void => {
        if (!enabled && visionEnabled) return;
        updateAiSettings({ debugScreenshots: enabled });
    };

    return {
        status, isRunning, prompt, setPrompt, selectedPlatform, platformData, fieldErrors,
        recordingEnabled, setRecordingEnabled, visionEnabled, screenshotsEnabled,
        runMutation, pauseMutation, resumeMutation, cancelMutation, updateSettingsMutation,
        handlePlatformChange, handleFieldChange, onSubmit, handleStop, handlePause, handleResume,
        handleVisionToggle, handleScreenshotsToggle, canSubmit, platformDefinition,
    };
}
