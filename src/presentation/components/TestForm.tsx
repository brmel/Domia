
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTestRunStore } from '../stores';
import { TestInputSchema, type TestInput } from '../../shared/validation';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';

interface TestFormProps {
    onOpenHistory: () => void;
    onOpenModelSettings: () => void;
}

export function TestForm({ onOpenHistory, onOpenModelSettings }: TestFormProps): React.ReactElement {
    const { status } = useTestRunStore();
    const isRunning = status === 'running';

    const runMutation = trpc.test.run.useMutation({
        onError: (error) => {
            console.error('Failed to start test:', error);
        }
    });

    const {
        register,
        handleSubmit,
        formState: { errors, isValid }
    } = useForm<TestInput>({
        resolver: zodResolver(TestInputSchema),
        defaultValues: {
            url: 'https://www.google.com',
            prompt: 'Validate that the search button is centered on the page',
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
        if (!isRunning) {
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
                            {...register('url')}
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
                        {...register('prompt')}
                        disabled={isRunning}
                    />
                </div>

                {/* Start Button - Sticky at bottom of scroll area or just below prompt */}
                <div className="mt-auto pt-4 pb-2">
                    <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gray-900 hover:bg-black text-white font-bold rounded-2xl shadow-xl shadow-gray-900/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] group"
                        disabled={isRunning || !isValid}
                    >
                        {isRunning ? (
                            <>
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                <span>Running...</span>
                            </>
                        ) : (
                            <>
                                <span className="text-xl group-hover:scale-110 transition-transform">✨</span>
                                <span>Start Agent</span>
                            </>
                        )}
                    </button>
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
                            className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-white hover:shadow-sm transition-all group"
                        >
                            <span className="text-2xl group-hover:-translate-y-0.5 transition-transform filter grayscale group-hover:grayscale-0">📜</span>
                            <span className="text-[10px] font-bold uppercase tracking-wide">History</span>
                        </button>

                        <div className="w-px h-8 bg-gray-200/50"></div>

                        {/* Settings Button (Merged Model & Debug) */}
                        <button
                            type="button"
                            onClick={onOpenModelSettings}
                            className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-white hover:shadow-sm transition-all group"
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
