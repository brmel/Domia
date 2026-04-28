import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PromptKey } from '@domain/ports/IPromptService';

const PROMPT_FILES: Record<PromptKey, string> = {
    systemInstruction: 'system-instruction.md',
    stepGoal: 'step-goal.md',
    targetingBoth: 'targeting/both.md',
    targetingRefOnly: 'targeting/ref-only.md',
    targetingMouseOnly: 'targeting/mouse-only.md',
    shellCapabilityNote: 'shell/capability-note.md',
    shellAvailableRule: 'shell/available-rule.md',
    shellUnavailableRule: 'shell/unavailable-rule.md',
    conversationCompaction: 'conversation-compaction.md',
};

function findPromptsRoot(): string {
    const candidates = [
        join(process.cwd(), 'prompts'),
        join(__dirname, '..', '..', '..', 'prompts'),
        join(__dirname, '..', '..', 'prompts'),
    ];
    for (const dir of candidates) {
        try {
            readFileSync(join(dir, 'system-instruction.md'), 'utf8');
            return dir;
        } catch {
            continue;
        }
    }
    throw new Error('Could not locate prompts/ directory');
}

export function loadDefaultPrompts(): Record<PromptKey, string> {
    const root = findPromptsRoot();
    const result = {} as Record<PromptKey, string>;
    for (const [key, file] of Object.entries(PROMPT_FILES) as Array<[PromptKey, string]>) {
        result[key] = readFileSync(join(root, file), 'utf8').trimEnd();
    }
    return result;
}
