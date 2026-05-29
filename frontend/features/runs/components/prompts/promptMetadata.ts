export const PROMPT_LABELS: Record<string, string> = {
    systemInstruction: 'System Instruction',
    stepGoal: 'Step Goal Template',
    targetingBoth: 'Targeting (Ref + Mouse)',
    targetingRefOnly: 'Targeting (Ref Only)',
    targetingMouseOnly: 'Targeting (Mouse Only)',
    shellCapabilityNote: 'Shell Capability Note',
    shellAvailableRule: 'Shell Rule — Available',
    shellUnavailableRule: 'Shell Rule — Unavailable',
};

export const PROMPT_GROUPS: Array<{ title: string; keys: string[] }> = [
    { title: 'Core', keys: ['systemInstruction', 'stepGoal'] },
    { title: 'Targeting', keys: ['targetingBoth', 'targetingRefOnly', 'targetingMouseOnly'] },
    { title: 'Shell', keys: ['shellCapabilityNote', 'shellAvailableRule', 'shellUnavailableRule'] },
];

export const PROMPT_VARIABLES: Record<string, string> = {
    systemInstruction: '{{toolNames}}  {{targetingSection}}  {{shellSection}}  {{shellExecRule}}',
    stepGoal: '{{stepGoal}}  {{viewportWidth}}  {{viewportHeight}}  {{url}}  {{maxActions}}',
};
