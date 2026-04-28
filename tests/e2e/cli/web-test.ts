#!/usr/bin/env node
import 'dotenv/config';
import { join } from 'path';
import { runCLITest, logTestResult } from './helpers/cli-test-helpers';
import { startFixtureServer } from './helpers/web-fixture-server';

async function main() {
    console.log('Test A: Web Platform (deterministic fixture)\n');
    
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error('Error: GOOGLE_API_KEY not set');
        process.exit(1);
    }
    
    const fixtureRoot = join(process.cwd(), 'tests/e2e/cli/fixtures/web-app');
    const server = await startFixtureServer(fixtureRoot);

    try {
        const result = await runCLITest({
            url: server.baseUrl,
            prompt: 'make sure button Start Scenario is present',
            maxSteps: 2,
            headless: true
        });

        logTestResult('Web: Fixture Smoke Check', result);
        process.exit(result.success ? 0 : 1);
    } finally {
        await server.stop();
    }
}

main().catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
});
