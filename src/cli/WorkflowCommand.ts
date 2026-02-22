import { Command } from 'commander';
import { container } from 'tsyringe';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ExecutionController } from '../application/controllers/ExecutionController';
import { WorkflowDefinitionService } from '../application/services/workflow/WorkflowDefinitionService';
import { WorkflowRunOrchestratorService } from '../application/services/workflow/WorkflowRunOrchestratorService';
import type { PlatformConfig } from '../domain/types/PlatformConfig';
import type { IPersistenceAdapter } from '../domain/ports';
import {
    CreateWorkflowInputSchema,
    UpdateWorkflowInputSchema
} from '../shared/validation/workflow';

interface WorkflowStepFileRecord {
    id?: string;
    name: string;
    prompt: string;
    continueOnFailure?: boolean;
    options?: Record<string, unknown>;
}

export class WorkflowCommand {
    static register(program: Command): void {
        const workflow = program.command('workflow').description('Manage and execute workflows');

        workflow
            .command('list')
            .description('List workflow definitions')
            .option('-l, --limit <limit>', 'Number of workflow definitions to show', '20')
            .action(async (options) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const limit = parseInt(String(options.limit), 10);
                const result = await persistence.getWorkflowDefinitions(Number.isFinite(limit) ? limit : 20);

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
                    console.log(`  [${index + 1}] ${step.name}`);
                    console.log(chalk.dim(`      ${step.prompt}`));
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
            .option('--launch-args <args>', 'Launch arguments for Electron (comma-separated)')
            .option('--window-title <title>', 'Target Electron window title')
            .action(async (options) => {
                const definitionService = container.resolve(WorkflowDefinitionService);

                const platformConfig = this.buildPlatformConfig(options);
                const steps = this.readStepsFile(options.stepsFile, false);

                const payload = CreateWorkflowInputSchema.parse({
                    name: options.name,
                    ...(options.description ? { description: options.description } : {}),
                    platformConfig,
                    steps: steps.map((step) => ({
                        name: step.name,
                        prompt: step.prompt,
                        continueOnFailure: step.continueOnFailure ?? false,
                        ...(step.options ? { options: step.options } : {})
                    }))
                });

                const created = await definitionService.createDraft({
                    name: payload.name,
                    ...(payload.description ? { description: payload.description } : {}),
                    platformConfig,
                    steps: payload.steps.map((step) => ({
                        name: step.name,
                        prompt: step.prompt,
                        continueOnFailure: step.continueOnFailure,
                        ...(step.options ? { options: step.options } : {})
                    }))
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
            .option('--launch-args <args>', 'Launch arguments for Electron (comma-separated)')
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

                const platformConfig = this.buildPlatformConfig(options, existingResult.value.platformConfig);
                const steps = this.readStepsFile(options.stepsFile, true);

                const payload = UpdateWorkflowInputSchema.parse({
                    id: workflowDefinitionId,
                    name: options.name,
                    ...(options.description ? { description: options.description } : {}),
                    platformConfig,
                    steps: steps.map((step) => ({
                        ...(step.id ? { id: step.id } : {}),
                        name: step.name,
                        prompt: step.prompt,
                        continueOnFailure: step.continueOnFailure ?? false,
                        ...(step.options ? { options: step.options } : {})
                    }))
                });

                const updated = await definitionService.updateDraft({
                    id: payload.id,
                    name: payload.name,
                    ...(payload.description ? { description: payload.description } : {}),
                    platformConfig,
                    steps: payload.steps.map((step) => ({
                        ...(step.id ? { id: step.id } : {}),
                        name: step.name,
                        prompt: step.prompt,
                        continueOnFailure: step.continueOnFailure,
                        ...(step.options ? { options: step.options } : {})
                    }))
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

        workflow
            .command('start <workflowDefinitionId>')
            .description('Start workflow execution and stream events')
            .action(async (workflowDefinitionId: string) => {
                const executionService = container.resolve(WorkflowRunOrchestratorService);
                const controller = new ExecutionController();

                process.on('SIGINT', () => {
                    console.log(chalk.yellow('\nStopping workflow...'));
                    controller.stop();
                });

                try {
                    for await (const event of executionService.executeWorkflow(workflowDefinitionId, controller)) {
                        switch (event.type) {
                            case 'workflow_started':
                                console.log(chalk.cyan(`Workflow started: ${event.workflowRunId}`));
                                break;
                            case 'workflow_step_started':
                                console.log(chalk.gray(`Step ${event.stepIndex + 1} started (${event.stepId})`));
                                break;
                            case 'workflow_step_bound':
                                console.log(chalk.gray(`Step ${event.stepIndex + 1} test run: ${event.testRunId}`));
                                break;
                            case 'workflow_step_completed':
                                console.log(event.success
                                    ? chalk.green(`Step ${event.stepIndex + 1} completed${event.summary ? `: ${event.summary}` : ''}`)
                                    : chalk.red(`Step ${event.stepIndex + 1} failed${event.summary ? `: ${event.summary}` : ''}`));
                                break;
                            case 'workflow_completed':
                                console.log(event.success
                                    ? chalk.green.bold(`Workflow completed${event.summary ? `: ${event.summary}` : ''}`)
                                    : chalk.red.bold(`Workflow failed${event.summary ? `: ${event.summary}` : ''}`));
                                process.exit(event.success ? 0 : 1);
                                break;
                            case 'workflow_failed':
                                console.log(chalk.red.bold(`Workflow failed: ${event.reason}`));
                                process.exit(1);
                                break;
                        }
                    }
                } catch (error) {
                    console.error(chalk.red(`Workflow execution error: ${String(error)}`));
                    process.exit(1);
                }
            });

        workflow
            .command('runs')
            .description('List workflow runs')
            .option('-l, --limit <limit>', 'Number of workflow runs to show', '20')
            .action(async (options) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const limit = parseInt(String(options.limit), 10);
                const result = await persistence.getWorkflowRuns(Number.isFinite(limit) ? limit : 20);

                if (result.isErr()) {
                    console.error(chalk.red(`Failed to list workflow runs: ${result.error.message}`));
                    process.exit(1);
                }

                if (result.value.length === 0) {
                    console.log(chalk.gray('No workflow runs found.'));
                    return;
                }

                console.log(chalk.bold('\nWorkflow Runs'));
                console.log('--------------------------------------------------');
                result.value.forEach((run) => {
                    const statusColor = run.status === 'completed'
                        ? chalk.green
                        : run.status === 'failed'
                            ? chalk.red
                            : run.status === 'cancelled'
                                ? chalk.yellow
                                : chalk.cyan;
                    console.log(`${chalk.gray(run.id)} | ${statusColor(run.status.toUpperCase())} | def=${run.workflowDefinitionId} v${run.workflowVersion}`);
                    if (run.summary) {
                        console.log(chalk.dim(`  ${run.summary}`));
                    }
                    console.log(chalk.dim(`  started=${run.startedAt}${run.completedAt ? ` | completed=${run.completedAt}` : ''}`));
                    console.log('');
                });
            });

        workflow
            .command('run-details <workflowRunId>')
            .description('Show details for a workflow run and step runs')
            .action(async (workflowRunId: string) => {
                const persistence = container.resolve<IPersistenceAdapter>('IPersistenceAdapter');
                const runResult = await persistence.getWorkflowRun(workflowRunId);

                if (runResult.isErr()) {
                    console.error(chalk.red(`Failed to load workflow run: ${runResult.error.message}`));
                    process.exit(1);
                }

                if (!runResult.value) {
                    console.error(chalk.red('Workflow run not found.'));
                    process.exit(1);
                }

                const stepsResult = await persistence.getWorkflowStepRuns(workflowRunId);
                if (stepsResult.isErr()) {
                    console.error(chalk.red(`Failed to load workflow step runs: ${stepsResult.error.message}`));
                    process.exit(1);
                }

                const run = runResult.value;
                console.log(chalk.bold(`\nWorkflow Run ${run.id}`));
                console.log('--------------------------------------------------');
                console.log(`Definition: ${run.workflowDefinitionId}`);
                console.log(`Version: ${run.workflowVersion}`);
                console.log(`Status: ${run.status}`);
                if (run.summary) {
                    console.log(`Summary: ${run.summary}`);
                }
                console.log(`Started: ${run.startedAt}`);
                if (run.completedAt) {
                    console.log(`Completed: ${run.completedAt}`);
                }

                console.log('\nStep Runs:');
                if (stepsResult.value.length === 0) {
                    console.log(chalk.gray('  No step runs found.'));
                    return;
                }

                stepsResult.value
                    .sort((a, b) => a.stepIndex - b.stepIndex)
                    .forEach((stepRun) => {
                        console.log(`  [${stepRun.stepIndex + 1}] ${stepRun.stepId} | ${stepRun.status}`);
                        if (stepRun.testRunId) {
                            console.log(chalk.dim(`      testRunId: ${stepRun.testRunId}`));
                        }
                        if (stepRun.summary) {
                            console.log(chalk.dim(`      ${stepRun.summary}`));
                        }
                    });
            });
    }

    private static readStepsFile(filePath: string, allowStepIds: boolean): WorkflowStepFileRecord[] {
        const absolutePath = resolve(process.cwd(), filePath);
        const content = readFileSync(absolutePath, 'utf8');
        const parsed = JSON.parse(content);

        if (!Array.isArray(parsed)) {
            throw new Error('Steps file must be a JSON array.');
        }

        const steps = parsed.map((record) => {
            if (!record || typeof record !== 'object') {
                throw new Error('Each step must be an object.');
            }

            const value = record as WorkflowStepFileRecord;
            if (!allowStepIds && value.id !== undefined) {
                throw new Error('Step id is not allowed when creating a workflow.');
            }

            return value;
        });

        if (steps.length === 0) {
            throw new Error('Steps file must contain at least one step.');
        }

        return steps;
    }

    private static buildPlatformConfig(options: {
        url?: string;
        cdpUrl?: string;
        executablePath?: string;
        launchArgs?: string;
        windowTitle?: string;
    }, defaultPlatformConfig?: PlatformConfig): PlatformConfig {
        const { url, cdpUrl, executablePath, launchArgs, windowTitle } = options;

        if (url) {
            return {
                platform: 'web',
                url
            };
        }

        if (cdpUrl) {
            return {
                platform: 'electron',
                connection: {
                    type: 'cdp',
                    cdpUrl,
                    ...(windowTitle ? { windowTitle } : {})
                }
            };
        }

        if (executablePath) {
            return {
                platform: 'electron',
                connection: {
                    type: 'executable',
                    executablePath,
                    ...(launchArgs ? { launchArgs: launchArgs.split(',').map((arg) => arg.trim()).filter(Boolean) } : {}),
                    ...(windowTitle ? { windowTitle } : {})
                }
            };
        }

        if (defaultPlatformConfig) {
            return defaultPlatformConfig;
        }

        throw new Error('Must provide one of --url, --cdp-url, or --executable-path.');
    }
}
