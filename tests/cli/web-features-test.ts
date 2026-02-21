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
    logTestResult('Web Feature: Deterministic Button Assertion', buttonResult);
    results.push({
        name: 'deterministic-button-assertion',
        passed: buttonResult.success
            && buttonResult.exitCode === 0
            && Boolean(buttonResult.runId)
            && buttonResult.output.includes("Text 'Start Scenario' is present."),
        ...(
            buttonResult.success
            && buttonResult.exitCode === 0
            && Boolean(buttonResult.runId)
            && buttonResult.output.includes("Text 'Start Scenario' is present.")
                ? {}
                : { details: 'Deterministic assertion did not produce expected pass output.' }
        )
    });

    let historyOk = false;
    let historyError: string | undefined;
    if (buttonResult.success && buttonResult.runId) {
        let showOutput = '';
        let showExitCode = 1;
        for (let attempt = 0; attempt < 5; attempt++) {
            const showResult = await runCLICommand(['history', 'show', buttonResult.runId]);
            showOutput = `${showResult.stdout}\n${showResult.stderr}`;
            showExitCode = showResult.exitCode;
            const containsGoal = showOutput.includes('Start Scenario');
            const containsRunId = showOutput.includes(buttonResult.runId);
            const containsStep = showOutput.includes('[1] pass') || showOutput.includes('Thought: Deterministic assertion evaluator');
            if (showExitCode === 0 && containsGoal && containsRunId && containsStep) {
                historyOk = true;
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        if (!historyOk && showExitCode === 0) {
            historyError = 'History exists but missing expected deterministic step details.';
        } else if (!historyOk) {
            historyError = 'History show command did not complete successfully.';
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

    let screenshotArtifactsOk = false;
    let screenshotArtifactError: string | undefined;
    if (screenshotResult.success && screenshotResult.runId) {
        const screenshotPath = await findRunStepAsset(screenshotResult.runId, '_screenshot.jpg');
        if (screenshotPath) {
            const screenshotStats = await stat(screenshotPath);
            screenshotArtifactsOk = screenshotStats.size > 1024;
        } else {
            screenshotArtifactsOk = false;
        }
        if (!screenshotArtifactsOk) {
            screenshotArtifactError = 'No usable screenshot artifact emitted when vision+screenshots enabled.';
        }
    } else {
        screenshotArtifactError = 'Vision screenshot run itself failed or did not expose runId.';
    }

    results.push({
        name: 'screenshot-artifact-emission',
        passed: screenshotArtifactsOk,
        ...(!screenshotArtifactsOk && screenshotArtifactError ? { details: screenshotArtifactError } : {})
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
        provider: 'google',
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

    const adaptivePlanningResult = await runCLITest({
        url: baseUrl,
        prompt: 'make sure text THIS_TEXT_WILL_NOT_EXIST is present',
        maxSteps: 4,
        headless: true
    });
    logTestResult('Web Feature: Adaptive Planning Signal', adaptivePlanningResult);

    const hasAdaptiveSignal = adaptivePlanningResult.output.includes('[Replanning]')
        || adaptivePlanningResult.output.includes('[Evaluating]');
    const adaptivePlanningOk = hasAdaptiveSignal && Boolean(adaptivePlanningResult.runId);

    results.push({
        name: 'planning-adaptive-native-signal',
        passed: adaptivePlanningOk,
        ...(adaptivePlanningOk ? {} : { details: 'CLI output did not expose adaptive planning telemetry signal on failed objective.' })
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

    const fixtureRoot = join(process.cwd(), 'tests/cli/fixtures/web-app');
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
