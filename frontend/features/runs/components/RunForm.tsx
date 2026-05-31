import { Button } from '@frontend/ui/Button';
import { canStart, canPause, canResume, canStop, isAgentRunning } from '@frontend/lib/agentStateUtils';
import { PlatformSelector } from './platform/PlatformSelector';
import { useRunForm } from './useRunForm';

interface RunFormProps {
    onOpenHistory: () => void;
    onOpenDebugSettings: () => void;
}

export function RunForm({ onOpenHistory, onOpenDebugSettings }: RunFormProps): React.ReactElement {
    const {
        status, isRunning, prompt, setPrompt, selectedPlatform, platformData, fieldErrors,
        recordingEnabled, setRecordingEnabled, visionEnabled, screenshotsEnabled,
        runMutation, pauseMutation, resumeMutation, cancelMutation, updateSettingsMutation,
        handlePlatformChange, handleFieldChange, onSubmit, handleStop, handlePause, handleResume,
        handleVisionToggle, handleScreenshotsToggle, canSubmit, platformDefinition,
    } = useRunForm();
    const PlatformFields = platformDefinition.renderFields;

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

                <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recording</h3>
                    <label className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                        <span>Capture per-action burst</span>
                        <input
                            type="checkbox"
                            checked={recordingEnabled}
                            onChange={(event) => setRecordingEnabled(event.target.checked)}
                            disabled={isRunning}
                        />
                    </label>
                </section>
            </aside>
        </form>
    );
}
