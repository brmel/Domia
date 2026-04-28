#!/usr/bin/env node
/**
 * Counter Scenario Tests — exercises Domia against two timing extremes.
 *
 * Design principle: the test asserts on SPECIFIC EVIDENCE that the agent
 * can ONLY produce by using the right tools.  No hardcoded "assert tool X
 * was called" — the fixture design makes success impossible without the tool.
 *
 * 1. **Fast Counter — forces recording tools** (< 1 s total)
 *    Button-triggered.  50 numbers flash one-at-a-time at 10 ms intervals
 *    (each replaces the previous).  When the counter finishes the grid is
 *    cleared entirely.  Number 37 is silently skipped.
 *
 *    The meta-test PASSES when the agent **fails and specifically mentions
 *    number 37**.  The ONLY way to know 37 is missing is by capturing DOM
 *    mutations via startRecording/stopAndReviewRecording — observe shows
 *    an empty grid after the sub-second process completes.
 *
 * 2. **Slow Counter — forces patience + observation** (~90 s total)
 *    Auto-starts.  30 numbers appear one every 3 seconds, accumulating in
 *    the grid.  When the counter finishes the grid stays visible for 15
 *    seconds before being cleared.  Number 23 is silently skipped.
 *
 *    The meta-test PASSES when the agent **fails and specifically mentions
 *    number 23**.  The agent must wait for completion (via waitForCondition
 *    or wait+observe), then examine the grid and detect the gap.
 *
 * Both tests use the real CLI binary, real Playwright browser, and the
 * real LLM.  No mocks.
 *
 * Run:
 *   GOOGLE_API_KEY=… tsx tests/cli/counter-scenario-test.ts
 *   npm run test:cli -- counter
 */
import 'dotenv/config';
import chalk from 'chalk';
import { join } from 'path';
import { runCLITest, logTestResult, type CLITestResult } from './helpers/cli-test-helpers';
import { startFixtureServer, type FixtureServerHandle } from './helpers/web-fixture-server';

// ──────────────────────────────── helpers ────────────────────────────────

/**
 * Strip ISO timestamps from CLI output so that numbers in timestamps
 * (e.g. the "37" in "21:36:37.472Z") don't cause false-positive matches
 * when we regex-check for specific missing numbers like \b37\b.
 */
function stripTimestamps(text: string): string {
    return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '');
}

function requireApiKey(): void {
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error(chalk.red('Error: GOOGLE_API_KEY or GEMINI_API_KEY must be set'));
        process.exit(1);
    }
}

interface ScenarioSpec {
    readonly name: string;
    readonly fixtureDir: string;
    readonly prompt: string;
    readonly maxSteps: number;
    /** Assert on the CLITestResult. Return { passed, reason }. */
    readonly assert: (result: CLITestResult) => { passed: boolean; reason: string };
}

async function runScenario(spec: ScenarioSpec): Promise<boolean> {
    console.log(chalk.blue(`\n── ${spec.name} ──\n`));

    let server: FixtureServerHandle | null = null;
    try {
        server = await startFixtureServer(spec.fixtureDir);

        const result = await runCLITest({
            url: server.baseUrl,
            prompt: spec.prompt,
            maxSteps: spec.maxSteps,
            headless: true,
        });

        logTestResult(spec.name, result);

        const { passed, reason } = spec.assert(result);
        console.log(passed ? chalk.green(`  ✔ ${reason}`) : chalk.red(`  ✘ ${reason}`));
        return passed;
    } catch (error) {
        console.error(chalk.red(`  ✘ Scenario threw: ${error instanceof Error ? error.message : error}`));
        return false;
    } finally {
        if (server) await server.stop();
    }
}

// ──────────────────────────── scenario definitions ──────────────────────

/**
 * FAST COUNTER — Recording Required
 *
 * Why recording is the only path to success:
 *   1. Agent observes → sees Start button, "Status: Ready", empty grid.
 *   2. Agent clicks Start → 50 numbers flash in 500 ms then grid clears.
 *   3. Agent observes again → sees "Process complete", empty grid.
 *   4. WITHOUT recording: agent has zero information about which numbers
 *      appeared.  It cannot mention "37" — meta-test fails.
 *   5. WITH recording: agent captured all DOM mutations, sees numbers
 *      1-36, 38-50 in allAddedValues, reports "37 missing" — meta-test passes.
 */
const FAST_COUNTER: ScenarioSpec = {
    name: 'Fast Counter — recording required (transient display)',
    fixtureDir: join(process.cwd(), 'tests/e2e/cli/fixtures/fast-counter'),
    maxSteps: 8,
    prompt:
        'This page has a Start button that triggers a fast process displaying numbers 1 through 50. ' +
        'Each number appears very briefly before being replaced. After the process finishes, the grid is cleared. ' +
        'Determine exactly which numbers from 1 to 50 were displayed during the process. ' +
        'If all 50 numbers appeared, pass. If any were skipped, fail listing the specific missing numbers.',
    assert(result) {
        const agentReportedFailure =
            result.exitCode !== 0 ||
            result.output.includes('Mission Failed');

        // The CRITICAL check: does the output mention the specific missing number?
        // This is ONLY possible if the agent used recording to capture transient mutations.
        // We strip ISO timestamps first to avoid false positives from time fields
        // (e.g. "21:36:37.472Z" contains "\b37\b" as seconds).
        const cleanOutput = stripTimestamps(result.output);
        const mentions37 = /\b37\b/.test(cleanOutput);

        if (agentReportedFailure && mentions37) {
            return {
                passed: true,
                reason: 'Agent used recording tools to detect that number 37 was skipped (specific evidence proves tool usage).',
            };
        }
        if (!agentReportedFailure) {
            return {
                passed: false,
                reason: 'Agent passed despite number 37 being missing — hallucination or failed to verify.',
            };
        }
        if (!mentions37) {
            return {
                passed: false,
                reason: 'Agent failed but did NOT mention number 37 — likely did not use recording (generic failure without specific evidence).',
            };
        }
        return { passed: false, reason: 'Unexpected outcome.' };
    },
};

/**
 * SLOW COUNTER — Patience + Accurate Observation Required
 *
 * Why waiting is required:
 *   1. Agent observes → sees counter in progress (e.g., "Counting 3/30").
 *   2. Agent must wait ~90 seconds for completion.
 *   3. After "Status: Complete", grid is visible for 15 seconds only.
 *   4. Agent observes grid → finds 29 numbers present, 23 is missing.
 *   5. Agent fails with "23 is missing" — meta-test passes.
 *
 * Without waiting: agent sees partial grid on first observe, can't verify
 * all numbers.  Without thorough analysis: agent misses the gap.
 */
const SLOW_COUNTER: ScenarioSpec = {
    name: 'Slow Counter — patience + detection (missing #23, ~90 s)',
    fixtureDir: join(process.cwd(), 'tests/e2e/cli/fixtures/slow-counter'),
    maxSteps: 8,
    prompt:
        'A background counter is adding numbers to the grid at its own pace. ' +
        'Wait for it to finish — the status will change to "Complete". ' +
        'Once complete, examine the number grid and verify that every integer from 1 through 30 is present. ' +
        'If any numbers are missing, fail stating which ones are absent. ' +
        'If all 30 are present, pass.',
    assert(result) {
        const agentReportedFailure =
            result.exitCode !== 0 ||
            result.output.includes('Mission Failed');

        // The CRITICAL check: does the output mention the specific missing number?
        // This is ONLY possible if the agent actually waited for completion and
        // examined the grid carefully.
        // Strip timestamps to avoid matching "23" in time fields like "21:37:23.797Z".
        const cleanOutput = stripTimestamps(result.output);
        const mentions23 = /\b23\b/.test(cleanOutput);

        if (agentReportedFailure && mentions23) {
            return { passed: true, reason: 'Agent correctly waited for completion and detected that number 23 is missing.' };
        }
        if (!agentReportedFailure) {
            return {
                passed: false,
                reason: 'Agent passed despite number 23 being missing — hallucination or incomplete verification.',
            };
        }
        return {
            passed: false,
            reason: 'Agent reported failure but did not mention the missing number 23 — observation was not thorough enough.',
        };
    },
};

// ─────────────────────────────── main ───────────────────────────────────

async function main(): Promise<void> {
    console.log(chalk.cyan.bold('\n  Domia Counter Scenario Tests\n'));
    requireApiKey();

    // Run fast first (quick feedback), then slow.
    const fastPassed = await runScenario(FAST_COUNTER);
    const slowPassed = await runScenario(SLOW_COUNTER);

    console.log(chalk.cyan('\n── Summary ──'));
    console.log(`  Fast Counter: ${fastPassed ? chalk.green('PASS') : chalk.red('FAIL')}`);
    console.log(`  Slow Counter: ${slowPassed ? chalk.green('PASS') : chalk.red('FAIL')}`);

    const allPassed = fastPassed && slowPassed;
    console.log(allPassed ? chalk.green.bold('\n  All counter scenarios passed!\n') : chalk.red.bold('\n  Some scenarios failed.\n'));
    process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
    console.error(chalk.red('Fatal:'), error);
    process.exit(1);
});
