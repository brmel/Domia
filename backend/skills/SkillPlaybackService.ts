import { inject, injectable } from 'tsyringe';
import type { ISkillPlayback, SkillPlaybackContext, SkillPlaybackOutcome, SkillShellExecutor } from '@domain/ports/ISkillPlayback';
import type { ISkillRepository } from '@domain/ports/ISkillRepository';
import type { IConfigService } from '@domain/ports/IConfigService';
import type { ILogger } from '@domain/ports';
import type { IShellPolicy } from '@domain/ports/IShellPolicy';
import { PlatformSessionFactory } from '@backend/platform/PlatformSessionFactory';
import type { RunInput } from '@backend/dto';

export interface SkillPlaybackRequest {
    readonly skillId: string;
    readonly args: Readonly<Record<string, unknown>>;
    readonly platformConfig: RunInput['platformConfig'];
    readonly options?: RunInput['options'];
}

export interface SkillPlaybackResult extends SkillPlaybackOutcome {
    readonly skillName: string;
    readonly totalSteps: number;
}

@injectable()
export class SkillPlaybackService {
    constructor(
        @inject('ISkillRepository') private readonly skills: ISkillRepository,
        @inject('ISkillPlayback') private readonly playback: ISkillPlayback,
        @inject(PlatformSessionFactory) private readonly sessionFactory: PlatformSessionFactory,
        @inject('IConfigService') private readonly configService: IConfigService,
        @inject('ILogger') private readonly logger: ILogger,
        @inject('SkillShellExecutor') private readonly shellExecutor: SkillShellExecutor,
        @inject('IShellPolicyFactory') private readonly shellPolicyFactory: () => IShellPolicy,
    ) {}

    async run(req: SkillPlaybackRequest): Promise<SkillPlaybackResult> {
        const skillResult = await this.skills.get(req.skillId);
        if (skillResult.isErr()) throw skillResult.error;
        const skill = skillResult.value;
        if (!skill) throw new Error(`Skill not found: ${req.skillId}`);

        const session = await this.sessionFactory.createSession({
            platformConfig: req.platformConfig,
            prompt: `skill:${skill.name}`,
            ...(req.options ? { options: req.options } : {}),
        });

        try {
            const ctx = this.buildContext(session.automation);
            this.logger.info(`[SkillPlaybackService] Playing skill "${skill.name}" (${skill.steps.length} steps)`);
            const outcome = await this.playback.play(skill, req.args, ctx);
            return { ...outcome, skillName: skill.name, totalSteps: skill.steps.length };
        } finally {
            await session.dispose();
        }
    }

    private buildContext(automation: SkillPlaybackContext['automation']): SkillPlaybackContext {
        const shellEnabled = this.configService.get().plugins.shell.enabled;
        if (!shellEnabled) return { automation };
        return {
            automation,
            shellExecutor: this.shellExecutor,
            shellPolicy: this.shellPolicyFactory(),
        };
    }
}
