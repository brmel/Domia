import type { Skill } from '@domain/entities/Skill';
import type { IStructuredAutomation } from '@domain/ports/IAppAutomation';
import type { IShellPolicy } from '@domain/ports/IShellPolicy';

interface ShellStream {
    readonly content: string;
    readonly fullLength: number;
    readonly truncated: boolean;
}

export interface SkillShellExecutor {
    execute(command: string, cwd?: string, timeoutMs?: number): Promise<{
        readonly exitCode: number;
        readonly stdout: ShellStream;
        readonly stderr: ShellStream;
    }>;
}

export interface SkillPlaybackContext {
    readonly automation: IStructuredAutomation;
    readonly shellExecutor?: SkillShellExecutor;
    readonly shellPolicy?: IShellPolicy;
}

export interface SkillPlaybackOutcome {
    readonly success: boolean;
    readonly stepsExecuted: number;
    readonly errorMessage?: string;
}

export interface ISkillPlayback {
    play(skill: Skill, args: Readonly<Record<string, unknown>>, context: SkillPlaybackContext): Promise<SkillPlaybackOutcome>;
}
