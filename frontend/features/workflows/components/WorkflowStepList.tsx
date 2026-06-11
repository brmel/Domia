import React from 'react';
import { Button } from '@frontend/ui/Button';
import type { EditableWorkflowStep } from './WorkflowWorkspace.helpers';

interface WorkflowStepListProps {
    steps: ReadonlyArray<EditableWorkflowStep>;
    moveStep: (index: number, delta: number) => void;
    updateStep: (stepId: string, updates: Partial<EditableWorkflowStep>) => void;
    removeStep: (stepId: string) => void;
}

export function WorkflowStepList({ steps, moveStep, updateStep, removeStep }: WorkflowStepListProps): React.ReactElement {
    return (
        <div className="mt-3 space-y-3 max-h-80 overflow-auto">
            {steps.map((step, index) => (
                <div key={step.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase">Step {index + 1}</div>
                        <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => moveStep(index, -1)} disabled={index === 0}>↑</Button>
                            <Button variant="ghost" size="sm" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1}>↓</Button>
                            <Button variant="ghost" size="sm" onClick={() => removeStep(step.id)} disabled={steps.length <= 1}>Remove</Button>
                        </div>
                    </div>

                    <input
                        value={step.name}
                        onChange={(event) => updateStep(step.id, { name: event.target.value })}
                        placeholder="Step name"
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    />
                    <textarea
                        value={step.prompt}
                        onChange={(event) => updateStep(step.id, { prompt: event.target.value })}
                        placeholder="Step prompt"
                        className="mt-2 w-full h-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    />
                    <label className="mt-2 flex items-center justify-between text-xs text-gray-700">
                        <span>Continue on Failure</span>
                        <input
                            type="checkbox"
                            checked={step.continueOnFailure}
                            onChange={(event) => updateStep(step.id, { continueOnFailure: event.target.checked })}
                        />
                    </label>
                </div>
            ))}
        </div>
    );
}
