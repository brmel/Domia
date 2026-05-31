import type { IShellPolicy, ShellPolicyDecision } from '@domain/ports/automation/IShellPolicy';
import { DEFAULT_SHELL_DENY_PATTERNS } from '@shared/defaults';

export class ShellCommandPolicyService implements IShellPolicy {
    private readonly denyPatterns: RegExp[];
    private readonly allowedCwds: readonly string[];

    constructor(denyPatterns?: readonly string[], allowedCwds?: readonly string[]) {
        this.denyPatterns = (denyPatterns ?? DEFAULT_SHELL_DENY_PATTERNS).map(p => new RegExp(p, 'i'));
        this.allowedCwds = allowedCwds ?? [];
    }

    evaluate(command: string, cwd?: string): ShellPolicyDecision {
        for (const pattern of this.denyPatterns) {
            if (pattern.test(command)) {
                return { allowed: false, reason: `Command blocked by shell policy: matches deny pattern ${pattern.source}` };
            }
        }

        if (cwd && this.allowedCwds.length > 0) {
            const normalizedCwd = cwd.replace(/\/+$/, '');
            const isAllowed = this.allowedCwds.some(allowed => {
                const normalizedAllowed = allowed.replace(/\/+$/, '');
                return normalizedCwd === normalizedAllowed || normalizedCwd.startsWith(normalizedAllowed + '/');
            });
            if (!isAllowed) {
                return { allowed: false, reason: `Working directory '${cwd}' is not in the allowed list` };
            }
        }

        return { allowed: true };
    }
}
