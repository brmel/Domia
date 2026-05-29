import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { WorkflowDefinitionService } from '@backend/workflows/WorkflowDefinitionService';
import type { IPersistenceAdapter } from '@domain/ports';
import { CreateWorkflowInputSchema, UpdateWorkflowInputSchema } from '@shared/contracts/workflow';
import { CLI_DEFAULT_LIST_LIMIT } from '@shared/defaults';
import { buildPlatformConfig } from '../platformUtils';
import { stepRecordToInput, readStepsFile } from './workflowStepsFile';

/** workflow definition CRUD + lifecycle subcommands. */
export function registerWorkflowDefinitionCommands(workflow: Command): void {
    workflow
        .command('list')
        .description('List workflow definitions')
        .option('-l, --limit <limit>', 'Number of workflow definitions to show', String(CLI_DEFAULT_LIST_LIMIT))
        .action(async (options) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const limit = parseInt(String(options.limit), 10);
            const result = await persistence.getWorkflowDefinitions(Number.isFinite(limit) ? limit : CLI_DEFAULT_LIST_LIMIT);

            if (result.isErr()) {
                console.error(chalk.red(`Failed to list workflows: ${result.error.message}`));
                process.exit(1);
            }

            if (result.value.length === 0) {
                console.log(chalk.gray('No workflow definitions found.'));
                return;
            }

            console.log(chalk.bold('\nWorkflow Definitions'));
            console.log('--------------------------------------------------');
            result.value.forEach((definition) => {
                console.log(`${chalk.gray(definition.id)} | ${chalk.cyan(definition.name)} | v${definition.version} | ${definition.status}`);
                console.log(chalk.dim(`  Steps: ${definition.steps.length} | Updated: ${definition.updatedAt}`));
                console.log('');
            });
        });

    workflow
        .command('show <workflowDefinitionId>')
        .description('Show workflow definition details')
        .action(async (workflowDefinitionId: string) => {
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const result = await persistence.getWorkflowDefinition(workflowDefinitionId);

            if (result.isErr()) {
                console.error(chalk.red(`Failed to load workflow: ${result.error.message}`));
                process.exit(1);
            }

            if (!result.value) {
                console.error(chalk.red('Workflow definition not found.'));
                process.exit(1);
            }

            const definition = result.value;
            console.log(chalk.bold(`\n${definition.name}`));
            console.log('--------------------------------------------------');
            console.log(`ID: ${definition.id}`);
            console.log(`Version: ${definition.version}`);
            console.log(`Status: ${definition.status}`);
            console.log(`Platform: ${definition.platformConfig.platform}`);
            if (definition.description) {
                console.log(`Description: ${definition.description}`);
            }
            console.log('Steps:');
            definition.steps.forEach((step, index) => {
                const label = step.kind === 'foreach' ? `${step.name} (for-each ×${step.items.length})` : step.name;
                const body = step.kind === 'foreach' ? step.bodyPrompt : step.prompt;
                console.log(`  [${index + 1}] ${label}`);
                console.log(chalk.dim(`      ${body}`));
                if (step.continueOnFailure) {
                    console.log(chalk.dim('      continueOnFailure: true'));
                }
            });
        });

    workflow
        .command('create')
        .description('Create a draft workflow definition')
        .requiredOption('-n, --name <name>', 'Workflow name')
        .requiredOption('--steps-file <path>', 'Path to JSON file containing workflow steps')
        .option('-d, --description <description>', 'Workflow description')
        .option('-u, --url <url>', 'Target URL for web workflows')
        .option('--cdp-url <cdpUrl>', 'CDP URL for Electron workflows')
        .option('--executable-path <path>', 'Path to Electron executable')
        .option('--launch-args <args...>', 'Launch arguments for Electron (space-separated)')
        .option('--window-title <title>', 'Target Electron window title')
        .action(async (options) => {
            const definitionService = container.resolve(WorkflowDefinitionService);

            const platformConfig = buildPlatformConfig(options);
            const steps = readStepsFile(options.stepsFile, false);

            const payload = CreateWorkflowInputSchema.parse({
                name: options.name,
                ...(options.description ? { description: options.description } : {}),
                platformConfig,
                steps: steps.map(stepRecordToInput),
            });

            const created = await definitionService.createDraft({
                name: payload.name,
                ...(payload.description ? { description: payload.description } : {}),
                platformConfig,
                steps: payload.steps as Parameters<typeof definitionService.createDraft>[0]['steps'],
            });

            console.log(chalk.green(`Created workflow draft: ${created.id}`));
        });

    workflow
        .command('update <workflowDefinitionId>')
        .description('Update an existing draft workflow definition')
        .requiredOption('-n, --name <name>', 'Workflow name')
        .requiredOption('--steps-file <path>', 'Path to JSON file containing workflow steps')
        .option('-d, --description <description>', 'Workflow description')
        .option('-u, --url <url>', 'Target URL for web workflows')
        .option('--cdp-url <cdpUrl>', 'CDP URL for Electron workflows')
        .option('--executable-path <path>', 'Path to Electron executable')
        .option('--launch-args <args...>', 'Launch arguments for Electron (space-separated)')
        .option('--window-title <title>', 'Target Electron window title')
        .action(async (workflowDefinitionId: string, options) => {
            const definitionService = container.resolve(WorkflowDefinitionService);
            const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
            const existingResult = await persistence.getWorkflowDefinition(workflowDefinitionId);

            if (existingResult.isErr()) {
                console.error(chalk.red(`Failed to load workflow: ${existingResult.error.message}`));
                process.exit(1);
            }

            if (!existingResult.value) {
                console.error(chalk.red('Workflow definition not found.'));
                process.exit(1);
            }

            const platformConfig = buildPlatformConfig(options, existingResult.value.platformConfig);
            const steps = readStepsFile(options.stepsFile, true);

            const payload = UpdateWorkflowInputSchema.parse({
                id: workflowDefinitionId,
                name: options.name,
                ...(options.description ? { description: options.description } : {}),
                platformConfig,
                steps: steps.map(stepRecordToInput),
            });

            const updated = await definitionService.updateDraft({
                id: payload.id,
                name: payload.name,
                ...(payload.description ? { description: payload.description } : {}),
                platformConfig,
                steps: payload.steps as Parameters<typeof definitionService.updateDraft>[0]['steps'],
            });

            console.log(chalk.green(`Updated workflow draft: ${updated.id}`));
        });

    workflow
        .command('publish <workflowDefinitionId>')
        .description('Publish a draft workflow definition')
        .action(async (workflowDefinitionId: string) => {
            const definitionService = container.resolve(WorkflowDefinitionService);
            const published = await definitionService.publishDraft(workflowDefinitionId);
            console.log(chalk.green(`Published workflow: ${published.id} (v${published.version})`));
        });

    workflow
        .command('next-version <workflowDefinitionId>')
        .description('Create next draft version from an existing workflow')
        .action(async (workflowDefinitionId: string) => {
            const definitionService = container.resolve(WorkflowDefinitionService);
            const next = await definitionService.createNextDraftVersion(workflowDefinitionId);
            console.log(chalk.green(`Created next draft version: ${next.id} (v${next.version})`));
        });
}
