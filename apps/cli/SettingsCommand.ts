import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import type { IConfigService } from '@domain/ports/platform/IConfigService';
import type { IPromptService } from '@domain/ports/agent/IPromptService';

const getConfig = () => container.resolve<IConfigService>('IConfigService');
const getPrompts = () => container.resolve<IPromptService>('IPromptService');

export class SettingsCommand {
    static register(program: Command): void {
        const settings = program.command('settings').description('View and update persistent settings');

        settings.command('get')
            .description('Show current settings')
            .action(() => {
                const config = getConfig().get();

                console.log(chalk.bold('\nCurrent Settings:'));
                console.log('--------------------------------------------------');
                console.log(`Headless: ${config.headless}`);
                console.log(`Max Steps: ${config.limits.maxSteps}`);
                console.log(`Delay Between Steps: ${config.limits.delayBetweenSteps}ms`);
                console.log(`AI Provider: ${config.ai.provider}`);
                console.log(`AI Model: ${config.ai.model}`);
                console.log(`Vision Enabled: ${config.ai.visionEnabled}`);
                console.log(`Debug Screenshots: ${config.ai.debugScreenshots}`);
                console.log(`Viewport: ${config.viewport.width}x${config.viewport.height}`);
                console.log(`Artifacts Dir: ${config.paths.artifactsDir}`);
                console.log(`Database Path: ${config.paths.databasePath}`);
            });

        settings.command('set <key> <value>')
            .description('Update a setting (headless, maxSteps, model, vision, screenshots)')
            .action((key: string, value: string) => {
                const configService = getConfig();

                const config = configService.get();

                switch (key) {
                    case 'headless':
                        configService.update({ headless: value === 'true' });
                        break;
                    case 'maxSteps':
                        configService.update({ limits: { ...config.limits, maxSteps: parseInt(value, 10) } });
                        break;
                    case 'model':
                        configService.update({ ai: { ...config.ai, model: value } });
                        break;
                    case 'vision':
                        configService.update({ ai: { ...config.ai, visionEnabled: value === 'true' } });
                        break;
                    case 'screenshots':
                        configService.update({ ai: { ...config.ai, debugScreenshots: value === 'true' } });
                        break;
                    default:
                        console.error(chalk.red(`Unknown setting: ${key}`));
                        console.log(chalk.gray('Available: headless, maxSteps, model, vision, screenshots'));
                        return;
                }

                console.log(chalk.green(`Updated ${key} = ${value}`));
            });

        const prompts = settings.command('prompts').description('Manage LLM prompt templates');

        prompts.command('list')
            .description('List all prompt templates and their override status')
            .action(() => {
                const promptService = getPrompts();
                const allPrompts = promptService.getAllPrompts();
                const allTools = promptService.getAllToolDescriptions();
                const overrides = promptService.getOverrides();

                const overridesObj = overrides as { prompts?: Record<string, string>; toolDescriptions?: Record<string, string> };

                console.log(chalk.bold('\nAgent Prompts:'));
                console.log('--------------------------------------------------');
                for (const [key, value] of Object.entries(allPrompts)) {
                    const isOverridden = !!overridesObj.prompts?.[key];
                    const marker = isOverridden ? chalk.yellow(' [customized]') : '';
                    const preview = value.slice(0, 80).replace(/\n/g, ' ');
                    console.log(`  ${chalk.cyan(key)}${marker}`);
                    console.log(`    ${chalk.gray(preview)}${value.length > 80 ? '…' : ''}`);
                }

                console.log(chalk.bold('\nTool Descriptions:'));
                console.log('--------------------------------------------------');
                for (const [name, desc] of Object.entries(allTools).sort(([a], [b]) => a.localeCompare(b))) {
                    const isOverridden = !!overridesObj.toolDescriptions?.[name];
                    const marker = isOverridden ? chalk.yellow(' [customized]') : '';
                    const preview = desc.slice(0, 80).replace(/\n/g, ' ');
                    console.log(`  ${chalk.cyan(name)}${marker}`);
                    console.log(`    ${chalk.gray(preview)}${desc.length > 80 ? '…' : ''}`);
                }
            });

        prompts.command('get <key>')
            .description('Show the full text of a prompt or tool description')
            .action((key: string) => {
                const promptService = getPrompts();
                const allPrompts = promptService.getAllPrompts();
                const allTools = promptService.getAllToolDescriptions();

                if (key in allPrompts) {
                    console.log(chalk.bold(`\n${key}:`));
                    console.log(allPrompts[key as keyof typeof allPrompts]);
                } else if (key in allTools) {
                    console.log(chalk.bold(`\nTool: ${key}`));
                    console.log(allTools[key]!);
                } else {
                    console.error(chalk.red(`Unknown prompt key: ${key}`));
                    console.log(chalk.gray(`Available: ${Object.keys(allPrompts).join(', ')}`));
                    console.log(chalk.gray(`Tools: ${Object.keys(allTools).sort().join(', ')}`));
                }
            });

        prompts.command('set <key> <value>')
            .description('Override a prompt or tool description')
            .action((key: string, value: string) => {
                const promptService = getPrompts();
                const allPrompts = promptService.getAllPrompts();
                const allTools = promptService.getAllToolDescriptions();

                if (key in allPrompts) {
                    promptService.setPromptOverride(key as Parameters<typeof promptService.setPromptOverride>[0], value);
                    console.log(chalk.green(`Updated prompt: ${key}`));
                } else if (key in allTools) {
                    promptService.setToolDescriptionOverride(key, value);
                    console.log(chalk.green(`Updated tool description: ${key}`));
                } else {
                    console.error(chalk.red(`Unknown prompt key: ${key}`));
                }
            });

        prompts.command('reset [key]')
            .description('Reset a prompt to default, or reset all if no key given')
            .action((key?: string) => {
                const promptService = getPrompts();

                if (!key) {
                    promptService.resetAll();
                    console.log(chalk.green('All prompts reset to defaults.'));
                    return;
                }

                const allPrompts = promptService.getAllPrompts();
                const allTools = promptService.getAllToolDescriptions();

                if (key in allPrompts) {
                    promptService.resetPrompt(key as Parameters<typeof promptService.resetPrompt>[0]);
                    console.log(chalk.green(`Reset prompt: ${key}`));
                } else if (key in allTools) {
                    promptService.resetToolDescription(key);
                    console.log(chalk.green(`Reset tool description: ${key}`));
                } else {
                    console.error(chalk.red(`Unknown prompt key: ${key}`));
                }
            });
    }
}
