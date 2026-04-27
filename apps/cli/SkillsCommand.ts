import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { SkillsAppService } from '@backend/skills/SkillsAppService';
import { SkillExtractionService } from '@backend/skills/SkillExtractionService';
import { SkillPlaybackService } from '@backend/skills/SkillPlaybackService';
import { SkillIdFactory } from '@domain/value-objects';
import { buildPlatformConfig } from './platformUtils';

function parseParamFlags(values: string[] | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const raw of values ?? []) {
        const eq = raw.indexOf('=');
        if (eq <= 0) continue;
        out[raw.slice(0, eq)] = raw.slice(eq + 1);
    }
    return out;
}

export class SkillsCommand {
    static register(program: Command): void {
        const skills = program.command('skills').description('Manage recorded skills');

        skills.command('list').description('List recorded skills').action(async () => {
            const service = container.resolve(SkillsAppService);
            const all = await service.list();
            if (all.length === 0) {
                console.log(chalk.gray('No skills recorded yet.'));
                return;
            }
            for (const s of all) {
                console.log(`${chalk.cyan(s.id)}  ${chalk.bold(s.name)}  ${chalk.gray(`(${s.steps.length} steps)`)}`);
                if (s.description) console.log(chalk.gray(`  ${s.description}`));
            }
        });

        skills.command('extract <runId>')
            .description('Extract a skill from a completed run')
            .requiredOption('-n, --name <name>', 'Skill name')
            .option('-d, --description <desc>', 'Skill description', '')
            .action(async (runId: string, options: { name: string; description: string }) => {
                const service = container.resolve(SkillsAppService);
                const extractor = container.resolve(SkillExtractionService);
                const steps = await extractor.fromRun(runId);
                if (steps.length === 0) {
                    console.error(chalk.red(`No replayable steps found in run ${runId}`));
                    process.exit(1);
                }
                const skill = await service.create({
                    name: options.name,
                    description: options.description,
                    steps,
                    createdFromRunId: runId,
                });
                console.log(chalk.green(`Created skill ${skill.id} ("${skill.name}") with ${skill.steps.length} steps`));
            });

        skills.command('delete <skillId>')
            .description('Delete a recorded skill')
            .action(async (skillId: string) => {
                const service = container.resolve(SkillsAppService);
                await service.delete(SkillIdFactory.create(skillId));
                console.log(chalk.green(`Deleted skill ${skillId}`));
            });

        skills.command('run <skillId>')
            .description('Replay a recorded skill deterministically (no LLM)')
            .option('-u, --url <url>', 'Target URL (Web platform)')
            .option('--cdp-url <cdpUrl>', 'CDP URL for Electron')
            .option('--executable-path <path>', 'Path to Electron executable')
            .option('--launch-args <args...>', 'Launch arguments for Electron')
            .option('--window-title <title>', 'Target window title (Electron)')
            .option('--param <key=value...>', 'Skill parameter (repeatable)')
            .action(async (skillId: string, options) => {
                const platformConfig = buildPlatformConfig(options);
                const args = parseParamFlags(options.param);
                const playback = container.resolve(SkillPlaybackService);
                try {
                    const result = await playback.run({ skillId, args, platformConfig });
                    if (result.success) {
                        console.log(chalk.green(`Skill "${result.skillName}" completed (${result.stepsExecuted}/${result.totalSteps} steps)`));
                        process.exit(0);
                    }
                    console.error(chalk.red(`Skill "${result.skillName}" failed at step ${result.stepsExecuted + 1}/${result.totalSteps}: ${result.errorMessage}`));
                    process.exit(1);
                } catch (e) {
                    console.error(chalk.red(`Playback failed: ${e instanceof Error ? e.message : e}`));
                    process.exit(1);
                }
            });
    }
}
