import type { AgentAction } from '@domain/value-objects';

export function getThought(action: AgentAction): string | undefined {
    return 'thought' in action ? (action as { thought?: string }).thought : undefined;
}
