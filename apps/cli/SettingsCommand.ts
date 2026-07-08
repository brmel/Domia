import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import type { IConfigService } from '@domain/ports/platform/IConfigService';
import type { IPromptOverrideStore } from '@domain/ports/agent/IPromptService';
import type { DomiaConfig } from '@shared/contracts/config';

const getConfig = () => container.resolve<IConfigService>('IConfigService');
const getPrompts = () => container.resolve<IPromptOverrideStore>('IPromptOverrideStore');

const SETTING_WRITERS: Record<string, (config: DomiaConfig, value: string) => Partial<DomiaConfig>> = {
    headless: (_config, value) => ({ headless: value === 'true' }),
    maxSteps: (config, value) => ({ limits: { ...config.limits, maxSteps: parseInt(value, 10) } }),
    model: (config, value) => ({ ai: { ...config.ai, model: value } }),
    vision: (config, value) => ({ ai: { ...config.ai, visionEnabled: value === 'true' } }),
    screenshots: (config, value) => ({ ai: { ...config.ai, debugScreenshots: value === 'true' } }),
};

function printOverridableSection(title: string, entries: [string, string][], overrides: Record<string, string> | undefined): void {
    console.log(chalk.bold(`\n${title}:`));
    console.log('--------------------------------------------------');
    for (const [key, text] of entries) {
        const marker = overrides?.[key] ? chalk.yellow(' [customized]') : '';
        const preview = text.slice(0, 80).replace(/\n/g, ' ');
        console.log(`  ${chalk.cyan(key)}${marker}`);
        console.log(`    ${chalk.gray(preview)}${text.length > 80 ? '…' : ''}`);
    }
}

function classifyPromptKey(store: IPromptOverrideStore, key: string): 'prompt' | 'tool' | null {
    if (key in store.getAllPrompts()) return 'prompt';
    if (key in store.getAllToolDescriptions()) return 'tool';
    return null;
}

function reportUnknownKey(store: IPromptOverrideStore, key: string): void {
    console.error(chalk.red(`Unknown prompt key: ${key}`));
    console.log(chalk.gray(`Available: ${Object.keys(store.getAllPrompts()).join(', ')}`));
    console.log(chalk.gray(`Tools: ${Object.keys(store.getAllToolDescriptions()).sort().join(', ')}`));
}

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
                console.log(`AI Provider: ${config.ai.provider}`);
                console.log(`AI Model: ${config.ai.model}`);
                console.log(`Vision Enabled: ${config.ai.visionEnabled}`);
                console.log(`Debug Screenshots: ${config.ai.debugScreenshots}`);
                console.log(`Viewport: ${config.viewport.width}x${config.viewport.height}`);
                console.log(`Artifacts Dir: ${config.paths.artifactsDir}`);
                console.log(`Database Path: ${config.paths.databasePath}`);
            });

        settings.command('set <key> <value>')
            .description(`Update a setting (${Object.keys(SETTING_WRITERS).join(', ')})`)
            .action((key: string, value: string) => {
                const writer = SETTING_WRITERS[key];
                if (!writer) {
                    console.error(chalk.red(`Unknown setting: ${key}`));
                    console.log(chalk.gray(`Available: ${Object.keys(SETTING_WRITERS).join(', ')}`));
                    return;
                }
                const configService = getConfig();
                configService.update(writer(configService.get(), value));
                console.log(chalk.green(`Updated ${key} = ${value}`));
            });

        const prompts = settings.command('prompts').description('Manage LLM prompt templates');

        prompts.command('list')
            .description('List all prompt templates and their override status')
            .action(() => {
                const promptService = getPrompts();
                const overrides = promptService.getOverrides() as { prompts?: Record<string, string>; toolDescriptions?: Record<string, string> };

                printOverridableSection('Agent Prompts', Object.entries(promptService.getAllPrompts()), overrides.prompts);
                printOverridableSection(
                    'Tool Descriptions',
                    Object.entries(promptService.getAllToolDescriptions()).sort(([a], [b]) => a.localeCompare(b)),
                    overrides.toolDescriptions,
                );
            });

        prompts.command('get <key>')
            .description('Show the full text of a prompt or tool description')
            .action((key: string) => {
                const promptService = getPrompts();
                const kind = classifyPromptKey(promptService, key);
                if (kind === 'prompt') {
                    console.log(chalk.bold(`\n${key}:`));
                    console.log(promptService.getAllPrompts()[key as keyof ReturnType<IPromptOverrideStore['getAllPrompts']>]);
                } else if (kind === 'tool') {
                    console.log(chalk.bold(`\nTool: ${key}`));
                    console.log(promptService.getAllToolDescriptions()[key]!);
                } else {
                    reportUnknownKey(promptService, key);
                }
            });

        prompts.command('set <key> <value>')
            .description('Override a prompt or tool description')
            .action((key: string, value: string) => {
                const promptService = getPrompts();
                const kind = classifyPromptKey(promptService, key);
                if (kind === 'prompt') {
                    promptService.setPromptOverride(key as Parameters<typeof promptService.setPromptOverride>[0], value);
                    console.log(chalk.green(`Updated prompt: ${key}`));
                } else if (kind === 'tool') {
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
                const kind = classifyPromptKey(promptService, key);
                if (kind === 'prompt') {
                    promptService.resetPrompt(key as Parameters<typeof promptService.resetPrompt>[0]);
                    console.log(chalk.green(`Reset prompt: ${key}`));
                } else if (kind === 'tool') {
                    promptService.resetToolDescription(key);
                    console.log(chalk.green(`Reset tool description: ${key}`));
                } else {
                    console.error(chalk.red(`Unknown prompt key: ${key}`));
                }
            });
    }
}
