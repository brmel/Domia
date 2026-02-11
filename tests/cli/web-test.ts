#!/usr/bin/env node
import { runCLITest, logTestResult } from './helpers/cli-test-helpers';

async function main() {
    console.log('Test A: Web Platform (google.com)\n');
    
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.error('Error: GOOGLE_API_KEY not set');
        process.exit(1);
    }
    
    const result = await runCLITest({
        url: 'https://www.google.com',
        prompt: 'make sure that the search button appears',
        maxSteps: 3,
        headless: true
    });
    
    logTestResult('Web: Google Search Button', result);
    process.exit(result.success ? 0 : 1);
}

main().catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
});
