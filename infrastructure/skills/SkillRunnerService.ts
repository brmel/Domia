import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { errAsync, okAsync, type Result, type ResultAsync } from 'neverthrow';
import type { ISkillRepository } from '@domain/ports/ISkillRepository';
import type { Skill, SkillStep } from '@domain/entities/Skill';
import type {
    ISkillPlayback,
    SkillPlaybackContext,
    SkillPlaybackOutcome,
} from '@domain/ports/ISkillPlayback';
import type { ToolSpec, ToolDependencies } from '../tools/ToolSpec';
import { ActionType } from '@domain/enums';
import type { ToolResult } from '@domain/types/ToolTypes';
import { UrlFactory } from '@domain/value-objects';
import { toolError, toolSuccess, errorMsg } from '../tools/toolResult';
import { DEFAULT_WAIT_DURATION_MS, MAX_SHELL_ERROR_OUTPUT_CHARS } from '@shared/defaults';

const SKILL_TOOL_PREFIX = 'skill_';

type DispatchResult = Result<unknown, { message: string }> | ResultAsync<unknown, { message: string }>;
type DispatchHandler = (params: Record<string, unknown>, ctx: SkillPlaybackContext) => DispatchResult | Promise<DispatchResult>;

const DISPATCH_TABLE: Partial<Record<ActionType, DispatchHandler>> = {
    [ActionType.CLICK]: (params, ctx) => ctx.automation.click(params['ref'] as string),
    [ActionType.TYPE]: (params, ctx) => ctx.automation.type(params['ref'] as string, params['text'] as string),
    [ActionType.PRESS_KEY]: (params, ctx) => ctx.automation.pressKey(params['key'] as string),
    [ActionType.WAIT]: (params, ctx) => ctx.automation.wait((params['durationMs'] as number) ?? DEFAULT_WAIT_DURATION_MS),
    [ActionType.NAVIGATE]: (params, ctx) => {
        const url = UrlFactory.create(String(params['url'] ?? ''));
        if (url.isErr()) return url as unknown as DispatchResult;
        return ctx.automation.navigateTo(url.value);
    },
    [ActionType.SHELL_EXEC]: async (params, ctx) => {
        if (!ctx.shellExecutor || !ctx.shellPolicy) {
            return errAsync({ message: 'Shell capability is disabled for this session' });
        }
        const command = String(params['command'] ?? '');
        const cwd = params['cwd'] as string | undefined;
        const timeoutMs = params['timeoutMs'] as number | undefined;
        const decision = ctx.shellPolicy.evaluate(command, cwd);
        if (!decision.allowed) {
            return errAsync({ message: `Shell policy denied: ${decision.reason ?? 'no reason given'}` });
        }
        const result = await ctx.shellExecutor.execute(command, cwd, timeoutMs);
        if (result.exitCode !== 0) {
            return errAsync({ message: `Command exited with code ${result.exitCode}: ${result.stderr.content.slice(0, MAX_SHELL_ERROR_OUTPUT_CHARS)}` });
        }
        return okAsync(result);
    },
};

@injectable()
export class SkillRunnerService implements ISkillPlayback {
    constructor(
        @inject('ISkillRepository') private readonly skills: ISkillRepository,
    ) {}

    async buildToolsForSession(deps: ToolDependencies): Promise<readonly ToolSpec[]> {
        const result = await this.skills.list();
        if (result.isErr()) return [];
        const ctx = toPlaybackContext(deps);
        return result.value.map((skill) => this.toToolSpec(skill, ctx));
    }

    async play(skill: Skill, args: Readonly<Record<string, unknown>>, ctx: SkillPlaybackContext): Promise<SkillPlaybackOutcome> {
        for (let i = 0; i < skill.steps.length; i++) {
            const step = skill.steps[i]!;
            const failure = await this.runStep(step, args, ctx);
            if (failure) {
                return { success: false, stepsExecuted: i, errorMessage: failure };
            }
        }
        return { success: true, stepsExecuted: skill.steps.length };
    }

    private toToolSpec(skill: Skill, ctx: SkillPlaybackContext): ToolSpec {
        const paramShape: Record<string, z.ZodTypeAny> = {};
        for (const p of skill.parameters) {
            paramShape[p.name] = p.required ? z.string() : z.string().optional();
        }
        return {
            name: `${SKILL_TOOL_PREFIX}${skill.name}`,
            description: skill.description || `Replay recorded skill: ${skill.name}`,
            actionType: ActionType.OBSERVE,
            parameters: z.object(paramShape),
            execute: async (args) => this.executeSkillAsTool(skill, args, ctx),
        };
    }

    private async executeSkillAsTool(
        skill: Skill,
        args: Record<string, unknown>,
        ctx: SkillPlaybackContext,
    ): Promise<ToolResult> {
        const outcome = await this.play(skill, args, ctx);
        return outcome.success
            ? toolSuccess({ skill: skill.name, stepsExecuted: outcome.stepsExecuted })
            : toolError(`Skill "${skill.name}" failed at step ${outcome.stepsExecuted + 1}/${skill.steps.length}: ${outcome.errorMessage}`);
    }

    private async runStep(
        step: SkillStep,
        args: Record<string, unknown>,
        ctx: SkillPlaybackContext,
    ): Promise<string | null> {
        const handler = DISPATCH_TABLE[step.actionType];
        if (!handler) return `Skill replay does not support action type "${step.actionType}"`;
        const params = this.interpolateParams(step.params, args);
        try {
            const result = await handler(params, ctx);
            return result.isErr() ? result.error.message : null;
        } catch (err) {
            return errorMsg(err);
        }
    }

    private interpolateParams(
        params: Readonly<Record<string, unknown>>,
        args: Readonly<Record<string, unknown>>,
    ): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(params)) {
            out[key] = typeof value === 'string' && value.startsWith('$')
                ? (args[value.slice(1)] ?? value)
                : value;
        }
        return out;
    }
}

function toPlaybackContext(deps: ToolDependencies): SkillPlaybackContext {
    return {
        automation: deps.automation,
        ...(deps.shellExecutor ? { shellExecutor: deps.shellExecutor } : {}),
        ...(deps.shellPolicy ? { shellPolicy: deps.shellPolicy } : {}),
    };
}
