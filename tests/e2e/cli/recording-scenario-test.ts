#!/usr/bin/env node
/**
 * Recording Tools Scenario Test — validates that startRecording and
 * stopAndReviewRecording work end-to-end through the real CLI.
 *
 * Design principle: the test asserts on SPECIFIC EVIDENCE (notification
 * content) that is ONLY obtainable via recording tools.  No hardcoded
 * "assert tool X was called" — the fixture makes success impossible
 * without the tool.
 *
 * Fixture: Flash Notifications
 *   - Five notification toasts appear one by one (every 600ms)
 *   - Each toast disappears after 400ms (transient)
 *   - By the time the agent can call observe(), the toast is already gone
 *   - The ONLY way to see the content is via recording tools
 *
 * The meta-test PASSES when the agent PASSES and reports ≥3 of the 5
 * notification messages.  This proves the agent used recording to capture
 * transient content that observe alone cannot see.
 *
 * Expected outcome: PASS — agent uses recording to capture transient toasts.
 *
 * Run:
 *   GOOGLE_API_KEY=… npx tsx tests/cli/recording-scenario-test.ts
 *   npm run test:cli -- recording
 */
import 'dotenv/config';
import chalk from 'chalk';
import { join } from 'path';
import { runCLITest, logTestResult, type CLITestResult } from './helpers/cli-test-helpers';
import { startFixtureServer, type FixtureServerHandle } from './helpers/web-fixture-server';

function requireApiKey(): void {
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error(chalk.red('Error: GOOGLE_API_KEY or GEMINI_API_KEY must be set'));
        process.exit(1);
    }
}

// Specific fragments from the 5 notification messages.
// These are ONLY visible via recording — each toast lasts 400ms.
const EXPECTED_FRAGMENTS = [
    'Order',       // "Order #1001 confirmed"
    '42.99',       // "Payment processed: $42.99"
    'Widget',      // "Inventory updated: Widget-X"
    'Email',       // "Email sent to customer"
    'Workflow',    // "Workflow complete"
];

async function main(): Promise<void> {
    console.log(chalk.cyan.bold('\n  Domia Recording Tools Scenario Test\n'));
    requireApiKey();

    let server: FixtureServerHandle | null = null;
    try {
        server = await startFixtureServer(join(process.cwd(), 'tests/e2e/cli/fixtures/flash-notifications'));
        console.log(chalk.blue('\n── Flash Notifications — recording tools validation ──\n'));

        const result: CLITestResult = await runCLITest({
            url: server.baseUrl,
            prompt:
                'This page has a "Run Process" button that triggers 5 toast notifications. ' +
                'Each notification flashes briefly then disappears — they are transient. ' +
                'Click the button, capture all 5 notification messages, and report them. ' +
                'If you can confirm all 5 messages, pass with the messages listed in your summary. ' +
                'If you cannot capture the messages, fail explaining why.',
            maxSteps: 10,
            headless: true,
        });

        logTestResult('Recording Tools — Flash Notifications', result);

        const agentPassed =
            result.exitCode === 0 ||
            result.output.includes('Mission Accomplished');

        const foundCount = EXPECTED_FRAGMENTS.filter(f =>
            result.output.toLowerCase().includes(f.toLowerCase())
        ).length;

        if (agentPassed && foundCount >= 3) {
            console.log(chalk.green(`  ✔ Agent captured ${foundCount}/5 notification messages — recording tools proved effective.`));
            console.log(chalk.green.bold('\n  Recording scenario PASSED!\n'));
            process.exit(0);
        } else if (agentPassed && foundCount < 3) {
            console.log(chalk.red(`  ✘ Agent passed but only mentioned ${foundCount}/5 notification messages — insufficient evidence of recording usage.`));
            console.log(chalk.red.bold('\n  Recording scenario FAILED (possible hallucination)\n'));
            process.exit(1);
        } else {
            console.log(chalk.red(`  ✘ Agent failed — could not capture transient notifications (${foundCount}/5 messages found).`));
            console.log(chalk.red.bold('\n  Recording scenario FAILED\n'));
            process.exit(1);
        }
    } catch (error) {
        console.error(chalk.red(`  ✘ Scenario threw: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
    } finally {
        if (server) await server.stop();
    }
}

main().catch((error) => {
    console.error(chalk.red('Fatal:'), error);
    process.exit(1);
});
