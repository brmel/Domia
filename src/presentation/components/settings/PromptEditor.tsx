import { useState } from 'react';
import { trpc } from '../../trpc';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../ui/CollapsibleSection';

const PROMPT_LABELS: Record<string, string> = {
    systemInstruction: 'System Instruction',
    stepGoal: 'Step Goal Template',
    loopWarning: 'Loop Warning',
    targetingBoth: 'Targeting (Ref + Mouse)',
    targetingRefOnly: 'Targeting (Ref Only)',
    targetingMouseOnly: 'Targeting (Mouse Only)',
};

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

    const hasOverrides = overrides && (
        (overrides.prompts && Object.keys(overrides.prompts).length > 0) ||
        (overrides.toolDescriptions && Object.keys(overrides.toolDescriptions).length > 0)
    );

    if (isLoading) {
        return <div className="text-gray-500 text-sm py-2">Loading prompts...</div>;
    }

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
                Customize the prompts sent to the LLM. Variables use <code className="bg-gray-100 px-1 rounded">{'{{variable}}'}</code> syntax.
                Overridden prompts are indicated with a dot.
            </p>

            <CollapsibleSection title="Agent Prompts" defaultOpen={true}>
                <div className="space-y-3">
                    {prompts && Object.entries(prompts).map(([key, value]) => {
                        const promptOverrides = overrides?.prompts as Record<string, string> | undefined;
                        return (
                            <PromptField
                                key={key}
                                label={PROMPT_LABELS[key] ?? key}
                                value={value}
                                isOverridden={!!promptOverrides?.[key]}
                                disabled={disabled}
                                onSave={(v) => setPromptMutation.mutate({ key, value: v })}
                                onReset={() => resetPromptMutation.mutate({ key })}
                                saving={setPromptMutation.isPending}
                            />
                        );
                    })}
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Tool Descriptions" defaultOpen={false}>
                <div className="space-y-3">
                    {toolDescs && Object.entries(toolDescs).sort(([a], [b]) => a.localeCompare(b)).map(([toolName, desc]) => {
                        const toolOverrides = overrides?.toolDescriptions as Record<string, string> | undefined;
                        return (
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
                        );
                    })}
                </div>
            </CollapsibleSection>
        </div>
    );
}

interface PromptFieldProps {
    label: string;
    value: string;
    isOverridden: boolean;
    disabled: boolean;
    onSave: (value: string) => void;
    onReset: () => void;
    saving: boolean;
}

function PromptField({ label, value, isOverridden, disabled, onSave, onReset, saving }: PromptFieldProps): JSX.Element {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const [expanded, setExpanded] = useState(false);

    const handleEdit = (): void => {
        setDraft(value);
        setEditing(true);
        setExpanded(true);
    };

    const handleSave = (): void => {
        if (draft !== value) {
            onSave(draft);
        }
        setEditing(false);
    };

    const handleCancel = (): void => {
        setDraft(value);
        setEditing(false);
    };

    const previewText = value.length > 120 ? `${value.slice(0, 120)}…` : value;

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div
                className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => !editing && setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2 min-w-0">
                    {isOverridden && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Customized" />
                    )}
                    <span className="text-sm font-medium text-gray-800 truncate">{label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {isOverridden && !editing && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); onReset(); }}
                            disabled={disabled}
                            className="text-xs text-gray-500 hover:text-red-600"
                        >
                            Reset
                        </Button>
                    )}
                    {!editing && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                            disabled={disabled}
                            className="text-xs"
                        >
                            Edit
                        </Button>
                    )}
                    <span className="text-gray-400 text-xs">{expanded ? '▾' : '▸'}</span>
                </div>
            </div>

            {expanded && !editing && (
                <div className="px-3 py-2 bg-white">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                        {value}
                    </pre>
                </div>
            )}

            {editing && (
                <div className="p-3 bg-white space-y-2">
                    <textarea
                        className="w-full min-h-40 text-xs font-mono border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y leading-relaxed"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={disabled || saving}
                        spellCheck={false}
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleCancel}
                            disabled={saving}
                            className="text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={handleSave}
                            disabled={disabled || saving || draft === value}
                            className="text-xs"
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </div>
            )}

            {!expanded && !editing && (
                <div className="px-3 py-1.5">
                    <p className="text-xs text-gray-400 truncate font-mono">{previewText}</p>
                </div>
            )}
        </div>
    );
}
