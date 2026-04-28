import type { ReactElement } from 'react';
import { useState } from 'react';
import { trpc } from '@frontend/api/trpc';
import { Button } from '@frontend/ui/Button';

export function SkillsWorkspace(): ReactElement {
    const utils = trpc.useUtils();
    const { data: skills, isLoading, error } = trpc.skills.list.useQuery();
    const deleteMutation = trpc.skills.delete.useMutation({
        onSuccess: () => utils.skills.list.invalidate(),
    });
    const createMutation = trpc.skills.createFromRun.useMutation({
        onSuccess: () => utils.skills.list.invalidate(),
    });
    const [extractRunId, setExtractRunId] = useState('');
    const [skillName, setSkillName] = useState('');
    const [skillDescription, setSkillDescription] = useState('');

    if (isLoading) {
        return <div className="p-6 text-gray-500">Loading skills…</div>;
    }
    if (error) {
        return <div className="p-6 text-red-500">Failed to load skills.</div>;
    }

    const onCreate = (e: React.FormEvent): void => {
        e.preventDefault();
        if (!extractRunId.trim() || !skillName.trim()) return;
        createMutation.mutate({
            runId: extractRunId.trim(),
            name: skillName.trim(),
            description: skillDescription.trim(),
        });
        setExtractRunId('');
        setSkillName('');
        setSkillDescription('');
    };

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-8">
            <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Skills</h2>
                <p className="text-sm text-gray-500">
                    Recorded automations the agent can invoke as a single tool. Extract a skill from any past run.
                </p>
            </div>

            <section className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Extract From Run</h3>
                <form onSubmit={onCreate} className="space-y-3">
                    <input
                        type="text"
                        placeholder="Run ID"
                        value={extractRunId}
                        onChange={(e) => setExtractRunId(e.target.value)}
                        className="w-full rounded-md border-gray-300 sm:text-sm p-2 border font-mono"
                    />
                    <input
                        type="text"
                        placeholder="Skill name (e.g. login_to_dashboard)"
                        value={skillName}
                        onChange={(e) => setSkillName(e.target.value)}
                        className="w-full rounded-md border-gray-300 sm:text-sm p-2 border"
                    />
                    <input
                        type="text"
                        placeholder="Description (optional)"
                        value={skillDescription}
                        onChange={(e) => setSkillDescription(e.target.value)}
                        className="w-full rounded-md border-gray-300 sm:text-sm p-2 border"
                    />
                    <Button type="submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? 'Extracting…' : 'Extract Skill'}
                    </Button>
                </form>
            </section>

            <section>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Recorded Skills</h3>
                {(!skills || skills.length === 0) && (
                    <p className="text-sm text-gray-500 italic">No skills recorded yet.</p>
                )}
                <ul className="space-y-3">
                    {skills?.map((skill) => (
                        <li key={skill.id} className="border border-gray-200 rounded-lg p-4 flex justify-between gap-4">
                            <div className="min-w-0">
                                <div className="font-medium text-gray-900">{skill.name}</div>
                                {skill.description && (
                                    <div className="text-sm text-gray-600 mt-1">{skill.description}</div>
                                )}
                                <div className="text-xs text-gray-400 mt-1 font-mono">
                                    {skill.steps.length} steps · id={skill.id}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMutation.mutate({ id: skill.id })}
                                disabled={deleteMutation.isPending}
                                className="text-red-600 hover:text-red-700"
                            >
                                Delete
                            </Button>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
