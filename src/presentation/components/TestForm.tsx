
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTestRunStore } from '../stores';
import { TestInputSchema, type TestInput } from '../../shared/validation';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { Button } from './ui/Button';
import { AgentStatus } from '../../domain/types/AgentStatus';
import { canStart, canPause, canResume, canStop, isAgentRunning } from '../utils/agentStateUtils';

interface TestFormProps {
    onOpenHistory: () => void;
    onOpenModelSettings: () => void;
}

export function TestForm({ onOpenHistory, onOpenModelSettings }: TestFormProps): React.ReactElement {
    const { status, setStatus, url, prompt, setUrl, setPrompt } = useTestRunStore();
    const isRunning = isAgentRunning(status);

    const runMutation = trpc.test.run.useMutation({
        onError: (error) => {
            console.error('Failed to start test:', error);
            setStatus(AgentStatus.FAILED);
        },
        onSuccess: () => {
            // Status will be updated via IPC event 'started'
        }
    });

    const {
        // register, // Unused now
        setValue,
        handleSubmit,
        formState: { errors, isValid }
    } = useForm<TestInput>({
        resolver: zodResolver(TestInputSchema),
        defaultValues: {
            url: url,
            prompt: prompt,
            options: {
                maxSteps: 20,
                headless: false,
                verbose: true,
                debug: false
            }
        },
        mode: 'onChange'
    });

    const { data: config } = trpc.settings.get.useQuery();

    const onSubmit = (data: TestInput): void => {
        if (canStart(status)) {
            setStatus(AgentStatus.RUNNING); // Optimistic update
            const finalData = {
                ...data,
                options: {
                    ...data.options,
                    vision: config?.ai?.visionEnabled ?? true,
                    debugScreenshots: config?.ai?.debugScreenshots ?? false
                }
            };
            runMutation.mutate(finalData);
        }
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
        setStatus(AgentStatus.CANCELLED); // Optimistic update
    };

    const handlePause = (): void => {
        pauseMutation.mutate();
        setStatus(AgentStatus.PAUSED); // Optimistic update
    };

    const handleResume = (): void => {
        resumeMutation.mutate();
        setStatus(AgentStatus.RUNNING); // Optimistic update
    };

    return (
        <form className="flex flex-col h-full bg-white relative" onSubmit={handleSubmit(onSubmit)}>
            {/* Scrollable Content */}
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
                {/* URL Input Area */}
                <div className="flex flex-col gap-2 mb-4">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400 pl-1">Target URL</label>
                    <div className="relative group">
                        <input
                            className={cn(
                                "w-full px-4 py-3 bg-gray-50 border-2 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white transition-all font-medium font-mono",
                                errors.url
                                    ? "border-red-100 focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
                                    : "border-transparent focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 group-hover:bg-white group-hover:border-gray-100"
                            )}
                            type="text"
                            placeholder="google.com"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value);
                                setValue('url', e.target.value, { shouldValidate: true });
                            }}
                            disabled={isRunning}
                            autoFocus
                        />
                        {errors.url && <span className="absolute right-3 top-3.5 text-xs text-red-500 font-bold">{errors.url.message}</span>}
                    </div>
                </div>

                {/* Prompt Area - Bigger Size */}
                <div className="flex flex-col gap-2 mb-6">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-400 pl-1">Goal Instructions</label>
                    <textarea
                        className={cn(
                            "w-full h-64 px-4 py-4 bg-gray-50 border-2 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white transition-all resize-none leading-relaxed",
                            errors.prompt
                                ? "border-red-100 focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
                                : "border-transparent focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 hover:bg-white hover:border-gray-100"
                        )}
                        placeholder="Describe the task step-by-step..."
                        value={prompt}
                        onChange={(e) => {
                            setPrompt(e.target.value);
                            setValue('prompt', e.target.value, { shouldValidate: true });
                        }}
                        disabled={isRunning}
                    />
                </div>

                {/* Agent Controls */}
                <div className="mt-auto pt-4 pb-2 space-y-3">
                    {canStart(status) && (
                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            className="w-full shadow-xl shadow-blue-500/20 py-4 rounded-2xl text-base"
                            disabled={!isValid || runMutation.isPending}
                            isLoading={runMutation.isPending}
                            leftIcon={<span>✨</span>}
                        >
                            Start Agent
                        </Button>
                    )}

                    {isAgentRunning(status) && (
                        <div className="grid grid-cols-2 gap-3">
                            {canPause(status) ? (
                                <Button
                                    variant="secondary"
                                    onClick={handlePause}
                                    className="py-3 rounded-xl"
                                    leftIcon={<span>⏸️</span>}
                                >
                                    Pause
                                </Button>
                            ) : canResume(status) ? (
                                <Button
                                    variant="primary"
                                    onClick={handleResume}
                                    className="py-3 rounded-xl"
                                    leftIcon={<span>▶️</span>}
                                >
                                    Resume
                                </Button>
                            ) : null}

                            {canStop(status) && (
                                <Button
                                    variant="danger"
                                    onClick={handleStop}
                                    className="py-3 rounded-xl"
                                    leftIcon={<span>⏹️</span>}
                                >
                                    Stop
                                </Button>
                            )}
                        </div>
                    )}

                    <p className="text-center text-[10px] text-gray-400 mt-3">
                        {isRunning ? 'Agent is working autonomously...' : 'Ready to explore'}
                    </p>
                </div>
            </div>

            {/* Bottom Toolbar - Clean Navigation */}
            <div className="flex-none px-6 py-4 border-t border-gray-100 bg-white z-20">
                <div className="flex items-center justify-between gap-4">
                    {/* Toolbar Buttons Group */}
                    <div className="flex w-full items-center justify-around bg-gray-50/50 rounded-2xl p-1 gap-1">
                        {/* History Button */}
                        <button
                            type="button"
                            onClick={onOpenHistory}
                            disabled={isRunning}
                            className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-white hover:shadow-sm transition-all group ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className="text-2xl group-hover:-translate-y-0.5 transition-transform filter grayscale group-hover:grayscale-0">📜</span>
                            <span className="text-[10px] font-bold uppercase tracking-wide">History</span>
                        </button>

                        <div className="w-px h-8 bg-gray-200/50"></div>

                        {/* Settings Button (Merged Model & Debug) */}
                        <button
                            type="button"
                            onClick={onOpenModelSettings}
                            disabled={isRunning}
                            className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-white hover:shadow-sm transition-all group ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className="text-2xl group-hover:-translate-y-0.5 transition-transform filter grayscale group-hover:grayscale-0">⚙️</span>
                            <span className="text-[10px] font-bold uppercase tracking-wide">Settings</span>
                        </button>
                    </div>
                </div>
            </div>
        </form>
    );
}
