import type { Skill } from '@domain/entities/Skill';
import type { IStructuredAutomation } from '@domain/ports/IAppAutomation';
import type { IShellPolicy } from '@domain/ports/IShellPolicy';

export interface SkillShellExecutor {
    execute(command: string, cwd?: string, timeoutMs?: number): Promise<{
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
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
