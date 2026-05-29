import { useState } from 'react';
import { Button } from '@frontend/ui/Button';

export interface PromptFieldProps {
    label: string;
    value: string;
    variables?: string | undefined;
    isOverridden: boolean;
    disabled: boolean;
    onSave: (value: string) => void;
    onReset: () => void;
    saving: boolean;
}

export function PromptField({
    label, value, variables, isOverridden, disabled, onSave, onReset, saving,
}: PromptFieldProps): JSX.Element {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const [expanded, setExpanded] = useState(false);

    const handleEdit = (): void => {
        setDraft(value);
        setEditing(true);
        setExpanded(true);
    };

    const handleSave = (): void => {
        if (draft !== value) onSave(draft);
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
                    {variables && (
                        <p className="text-xs text-gray-400">
                            Variables: <span className="font-mono">{variables}</span>
                        </p>
                    )}
                    <textarea
                        className="w-full min-h-40 text-xs font-mono border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y leading-relaxed"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={disabled || saving}
                        spellCheck={false}
                        autoFocus
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
                            {saving ? 'Saving…' : 'Save'}
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
