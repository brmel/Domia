import { trpc } from '@frontend/api/trpc';
import { Button } from '@frontend/ui/Button';
import { CollapsibleSection } from '@frontend/ui/CollapsibleSection';
import { PromptField } from './prompts/PromptField';
import { PROMPT_LABELS, PROMPT_GROUPS, PROMPT_VARIABLES } from './prompts/promptMetadata';

export function PromptEditor({ disabled = false }: { disabled?: boolean }): JSX.Element {
    const utils = trpc.useUtils();
    const promptsQuery = trpc.prompts.getAllPrompts.useQuery();
    const toolDescsQuery = trpc.prompts.getAllToolDescriptions.useQuery();
    const overridesQuery = trpc.prompts.getOverrides.useQuery();

    const setPromptMutation = trpc.prompts.setPrompt.useMutation({
        onSuccess: () => {
            utils.prompts.getAllPrompts.invalidate();
            utils.prompts.getOverrides.invalidate();
        },
    });
    const resetPromptMutation = trpc.prompts.resetPrompt.useMutation({
        onSuccess: () => {
            utils.prompts.getAllPrompts.invalidate();
            utils.prompts.getOverrides.invalidate();
        },
    });
    const setToolDescMutation = trpc.prompts.setToolDescription.useMutation({
        onSuccess: () => {
            utils.prompts.getAllToolDescriptions.invalidate();
            utils.prompts.getOverrides.invalidate();
        },
    });
    const resetToolDescMutation = trpc.prompts.resetToolDescription.useMutation({
        onSuccess: () => {
            utils.prompts.getAllToolDescriptions.invalidate();
            utils.prompts.getOverrides.invalidate();
        },
    });
    const resetAllMutation = trpc.prompts.resetAll.useMutation({
        onSuccess: () => {
            utils.prompts.getAllPrompts.invalidate();
            utils.prompts.getAllToolDescriptions.invalidate();
            utils.prompts.getOverrides.invalidate();
        },
    });

    const prompts = promptsQuery.data;
    const toolDescs = toolDescsQuery.data;
    const overrides = overridesQuery.data;
    const isLoading = promptsQuery.isLoading || toolDescsQuery.isLoading;

    const promptOverrides = overrides?.prompts as Record<string, string> | undefined;
    const toolOverrides = overrides?.toolDescriptions as Record<string, string> | undefined;

    const hasOverrides =
        (promptOverrides && Object.keys(promptOverrides).length > 0) ||
        (toolOverrides && Object.keys(toolOverrides).length > 0);

    if (isLoading) {
        return <div className="text-gray-500 text-sm py-2">Loading prompts...</div>;
    }

    const allGroupedKeys = new Set(PROMPT_GROUPS.flatMap((g) => g.keys));
    const ungroupedKeys = prompts
        ? Object.keys(prompts).filter((k) => !allGroupedKeys.has(k))
        : [];

    const renderPromptGroup = (title: string, entries: [string, string][]): JSX.Element => (
        <div key={title}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {title}
            </p>
            <div className="space-y-2">
                {entries.map(([key, value]) => (
                    <PromptField
                        key={key}
                        label={PROMPT_LABELS[key] ?? key}
                        value={value}
                        variables={PROMPT_VARIABLES[key]}
                        isOverridden={!!promptOverrides?.[key]}
                        disabled={disabled}
                        onSave={(v) => setPromptMutation.mutate({ key, value: v })}
                        onReset={() => resetPromptMutation.mutate({ key })}
                        saving={setPromptMutation.isPending}
                    />
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                    Prompt Templates
                </h3>
                {hasOverrides && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => resetAllMutation.mutate()}
                        disabled={disabled || resetAllMutation.isPending}
                        className="text-xs text-red-600 hover:text-red-700"
                    >
                        Reset All
                    </Button>
                )}
            </div>

            <p className="text-xs text-gray-500">
                Customize every prompt sent to the LLM. Variables use{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{variable}}'}</code> syntax.
                Customized prompts are marked with a dot.
            </p>

            <CollapsibleSection title="Agent Prompts" defaultOpen={true}>
                <div className="space-y-4">
                    {PROMPT_GROUPS.map((group) => {
                        const groupEntries = group.keys
                            .filter((k) => prompts && k in prompts)
                            .map((k) => [k, (prompts as Record<string, string>)[k]] as [string, string]);
                        if (groupEntries.length === 0) return null;
                        return renderPromptGroup(group.title, groupEntries);
                    })}

                    {ungroupedKeys.length > 0 && prompts &&
                        renderPromptGroup('Other', ungroupedKeys.map((key) => [key, (prompts as Record<string, string>)[key] ?? '']))}
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Tool Descriptions" defaultOpen={false}>
                <div className="space-y-2">
                    {toolDescs &&
                        Object.entries(toolDescs)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([toolName, desc]) => (
                                <PromptField
                                    key={toolName}
                                    label={toolName}
                                    value={desc}
                                    isOverridden={!!toolOverrides?.[toolName]}
                                    disabled={disabled}
                                    onSave={(v) => setToolDescMutation.mutate({ toolName, value: v })}
                                    onReset={() => resetToolDescMutation.mutate({ toolName })}
                                    saving={setToolDescMutation.isPending}
                                />
                            ))}
                </div>
            </CollapsibleSection>
        </div>
    );
}
