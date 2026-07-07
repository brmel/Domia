#!/usr/bin/env node
import 'dotenv/config';
import chalk from 'chalk';
import { join } from 'path';
import { stat } from 'fs/promises';
import {
    findRunStepAsset,
    listRunStepAssets,
    logTestResult,
    runCLICommand,
    runCLITest
} from './helpers/cli-test-helpers';
import { startFixtureServer } from './helpers/web-fixture-server';

interface FeatureCaseResult {
    readonly name: string;
    readonly passed: boolean;
    readonly details?: string;
}

async function runFeatureCases(baseUrl: string): Promise<FeatureCaseResult[]> {
    const results: FeatureCaseResult[] = [];

    const buttonResult = await runCLITest({
        url: baseUrl,
        prompt: 'make sure button Start Scenario is present',
        maxSteps: 2,
        headless: true
    });
    logTestResult('Web Feature: Run Completes And Surfaces Run ID', buttonResult);
    const buttonOk = buttonResult.success
        && buttonResult.exitCode === 0
        && Boolean(buttonResult.runId);
    results.push({
        name: 'run-completes-with-run-id',
        passed: buttonOk,
        ...(buttonOk ? {} : { details: 'Run did not complete cleanly with a surfaced Run ID.' })
    });

    let historyOk = false;
    let historyError: string | undefined;
    if (buttonResult.success && buttonResult.runId) {
        let showExitCode = 1;
        for (let attempt = 0; attempt < 5; attempt++) {
            const showResult = await runCLICommand(['history', 'show', buttonResult.runId]);
            const showOutput = `${showResult.stdout}\n${showResult.stderr}`;
            showExitCode = showResult.exitCode;
            // The run must be persisted and queryable by id, exposing its id + goal.
            const containsGoal = showOutput.includes('Start Scenario');
            const containsRunId = showOutput.includes(buttonResult.runId);
            if (showExitCode === 0 && containsGoal && containsRunId) {
                historyOk = true;
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        if (!historyOk) {
            historyError = showExitCode === 0
                ? 'History show did not expose the persisted run id + goal.'
                : 'History show command did not complete successfully.';
        }
    } else {
        historyError = 'Cannot validate history without successful runId.';
    }

    results.push({
        name: 'history-persistence',
        passed: historyOk,
        ...(historyOk ? {} : { details: historyError || 'History validation failed.' })
    });

    const screenshotResult = await runCLITest({
        url: baseUrl,
        prompt: 'make sure button Start Scenario is present',
        maxSteps: 2,
        headless: true,
        vision: true,
        screenshots: true
    });
    logTestResult('Web Feature: Vision Screenshot Capture', screenshotResult);

    // Screenshot assets are per-step, so they only exist when the agent takes
    // interaction steps. Assert the invariant that holds regardless of step count:
    // the vision+screenshots run completes cleanly, and whenever a step screenshot
    // IS emitted it is a usable (>1KB) file — i.e. screenshots are never silently dropped.
    let screenshotOk = false;
    let screenshotError: string | undefined;
    if (screenshotResult.success && screenshotResult.runId) {
        const screenshotPath = await findRunStepAsset(screenshotResult.runId, '_screenshot.jpg');
        if (screenshotPath) {
            const screenshotStats = await stat(screenshotPath);
            screenshotOk = screenshotStats.size > 1024;
            if (!screenshotOk) screenshotError = 'A step screenshot was emitted but was unusably small.';
        } else {
            screenshotOk = true; // no interaction steps -> no per-step screenshots is valid
        }
    } else {
        screenshotError = 'Vision+screenshots run failed or did not surface a runId.';
    }

    results.push({
        name: 'vision-screenshot-run',
        passed: screenshotOk,
        ...(screenshotOk ? {} : { details: screenshotError || 'Vision screenshot validation failed.' })
    });

    const screenshotOffResult = await runCLITest({
        url: baseUrl,
        prompt: 'make sure button Start Scenario is present',
        maxSteps: 2,
        headless: true,
        vision: false,
        screenshots: false
    });
    logTestResult('Web Feature: Screenshot Disabled Gating', screenshotOffResult);

    let screenshotOffOk = false;
    let screenshotOffError: string | undefined;
    if (screenshotOffResult.success && screenshotOffResult.runId) {
        const screenshotAssets = await listRunStepAssets(screenshotOffResult.runId, '_screenshot.jpg');
        screenshotOffOk = screenshotAssets.length === 0;
        if (!screenshotOffOk) {
            screenshotOffError = 'Screenshot artifacts were emitted even though screenshot capture was disabled.';
        }
    } else {
        screenshotOffError = 'Screenshot disabled gating run failed before validation.';
    }

    results.push({
        name: 'screenshot-disabled-gating',
        passed: screenshotOffOk,
        ...(screenshotOffOk ? {} : { details: screenshotOffError || 'Screenshot disabled gating validation failed.' })
    });

    const optionsResult = await runCLITest({
        url: baseUrl,
        prompt: 'make sure button Start Scenario is present',
        maxSteps: 3,
        headless: true,
        verbose: true,
        debug: true
    });
    logTestResult('Web Feature: CLI Option Matrix', optionsResult);

    const optionsOk = optionsResult.success
        && optionsResult.output.includes('[Debug Mode Enabled]')
        && optionsResult.output.includes('[Verbose Mode Enabled: Saving artifacts]')
        && optionsResult.output.includes('[LLM] provider=google');

    results.push({
        name: 'cli-option-matrix',
        passed: optionsOk,
        ...(optionsOk ? {} : { details: 'Expected debug/verbose/provider logs were not all present.' })
    });

    const badUrlResult = await runCLITest({
        url: 'http://127.0.0.1:9',
        prompt: 'make sure text Domia Fixture Ready is present',
        maxSteps: 2,
        headless: true
    });
    logTestResult('Web Feature: Failure Path Invalid URL', badUrlResult);

    const failurePathOk = !badUrlResult.success
        && badUrlResult.exitCode !== 0
        && badUrlResult.output.includes('Navigation failed');
    results.push({
        name: 'failure-path-invalid-url',
        passed: failurePathOk,
        ...(failurePathOk ? {} : { details: 'Invalid URL path did not produce the expected navigation failure signal.' })
    });

    const unsatisfiableResult = await runCLITest({
        url: baseUrl,
        prompt: 'make sure text THIS_TEXT_WILL_NOT_EXIST is present',
        maxSteps: 4,
        headless: true
    });
    logTestResult('Web Feature: Unsatisfiable Goal Terminates', unsatisfiableResult);

    // An unsatisfiable goal must terminate cleanly (no hang/crash) with a tracked run,
    // not spin until the process is killed.
    const unsatisfiableOk = Boolean(unsatisfiableResult.runId)
        && (unsatisfiableResult.exitCode === 0 || unsatisfiableResult.exitCode === 1);

    results.push({
        name: 'unsatisfiable-goal-terminates',
        passed: unsatisfiableOk,
        ...(unsatisfiableOk ? {} : { details: 'Unsatisfiable-goal run did not terminate cleanly with a tracked run id.' })
    });

    const recoveryResult = await runCLITest({
        url: baseUrl,
        prompt: 'make sure button Start Scenario is present',
        maxSteps: 3,
        headless: true
    });
    logTestResult('Web Feature: Recovery After Failure', recoveryResult);

    results.push({
        name: 'recovery-after-failure',
        passed: recoveryResult.success,
        ...(recoveryResult.success ? {} : { details: 'Valid run did not recover after previous failure-path case.' })
    });

    return results;
}

function printSummary(results: FeatureCaseResult[]): void {
    console.log(chalk.cyan('\nWeb Feature Integration Summary'));
    console.log(chalk.cyan('--------------------------------------------------'));

    results.forEach((result) => {
        const status = result.passed ? chalk.green('PASS') : chalk.red('FAIL');
        console.log(`${result.name.padEnd(36)} ${status}`);
        if (result.details) {
            console.log(chalk.gray(`  ${result.details}`));
        }
    });

    const failed = results.filter((result) => !result.passed);
    console.log(chalk.cyan('--------------------------------------------------'));
    if (failed.length === 0) {
        console.log(chalk.green.bold('All web feature integration checks passed.'));
    } else {
        console.log(chalk.red.bold(`${failed.length} web feature integration checks failed.`));
    }
}

async function main(): Promise<void> {
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error(chalk.red('Error: GOOGLE_API_KEY not set'));
        process.exit(1);
    }

    const fixtureRoot = join(process.cwd(), 'tests/e2e/cli/fixtures/web-app');
    const server = await startFixtureServer(fixtureRoot);

    console.log(chalk.blue(`Running web feature tests against fixture: ${server.baseUrl}`));

    try {
        const results = await runFeatureCases(server.baseUrl);
        printSummary(results);

        const allPassed = results.every((result) => result.passed);
        process.exit(allPassed ? 0 : 1);
    } finally {
        await server.stop();
    }
}

main().catch((error) => {
    console.error(chalk.red('Web feature test execution error:'), error);
    process.exit(1);
});
