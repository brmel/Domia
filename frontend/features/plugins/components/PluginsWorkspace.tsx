import { trpc } from '@frontend/api/trpc';
import type { DomiaConfig } from '@shared/contracts/config';

interface PluginCardProps {
    icon: string;
    name: string;
    description: string;
    tools: string[];
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    saving: boolean;
}

function PluginCard({ icon, name, description, tools, enabled, onToggle, saving }: PluginCardProps): JSX.Element {
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                    <span className="text-2xl leading-none mt-0.5">{icon}</span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-gray-900">{name}</h3>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                                enabled
                                    ? 'bg-green-50 border-green-200 text-green-700'
                                    : 'bg-gray-50 border-gray-200 text-gray-500'
                            }`}>
                                {enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600 leading-relaxed">{description}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                            {tools.map((tool) => (
                                <span
                                    key={tool}
                                    className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-mono text-gray-600"
                                >
                                    {tool}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={saving}
                    onClick={() => onToggle(!enabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                        enabled ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                >
                    <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                            enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                </button>
            </div>
        </div>
    );
}

export function PluginsWorkspace(): JSX.Element {
    const utils = trpc.useUtils();
    const { data: config, isLoading } = trpc.settings.get.useQuery();
    const updateMutation = trpc.settings.update.useMutation({
        onSuccess: () => {
            utils.settings.get.invalidate();
        },
    });

    const handleToggleShell = (enabled: boolean): void => {
        if (!config) return;
        const updated: DomiaConfig = {
            ...config,
            plugins: {
                ...config.plugins,
                shell: { enabled },
            },
        };
        updateMutation.mutate(updated);
    };

    if (isLoading && !config) {
        return (
            <section className="h-full w-full p-6 bg-gray-50 overflow-auto">
                <div className="max-w-4xl mx-auto text-sm text-gray-500">Loading plugins…</div>
            </section>
        );
    }

    if (!config) {
        return (
            <section className="h-full w-full p-6 bg-gray-50 overflow-auto">
                <div className="max-w-4xl mx-auto text-sm text-red-500">Failed to load settings.</div>
            </section>
        );
    }

    const shellEnabled = config.plugins?.shell?.enabled ?? false;

    return (
        <section className="h-full w-full p-6 bg-gray-50 overflow-auto">
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Plugins</h2>
                    <p className="mt-1 text-sm text-gray-500 leading-relaxed">
                        Enable or disable capability plugins. Changes take effect on the next agent run.
                    </p>
                </div>

                <PluginCard
                    icon="🐚"
                    name="Shell Execution"
                    description="Allows the agent to run shell commands on the host machine during a run. Adds the shell_exec tool to all platforms."
                    tools={['shell_exec']}
                    enabled={shellEnabled}
                    onToggle={handleToggleShell}
                    saving={updateMutation.isPending}
                />
            </div>
        </section>
    );
}
