#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'child_process';
import chalk from 'chalk';

const args = process.argv.slice(2);
const platform = args.find(arg => !arg.startsWith('--'));

function printBanner() {
    console.log(chalk.cyan('Domia CLI Production Test Runner\n'));
}

function printUsage() {
    console.log('Usage:');
    console.log('  npm run test:cli              # Web quality suite');
    console.log('  npm run test:cli -- web       # Web only');
    console.log('  npm run test:cli -- electron  # Electron only');
    console.log('  npm run test:cli -- counter   # Fast + Slow counter scenarios');
    console.log('  npm run test:cli -- recording # Recording tools scenario');
    console.log('  npm run test:cli -- shell     # Shell capability gate (enabled vs disabled)');
    console.log('  npm run test:cli -- all       # Web + Electron + Counter + Recording + Shell\n');
}

async function runTest(testFile: string, testName: string): Promise<boolean> {
    console.log(chalk.blue(`Running ${testName}...\n`));
    
    return new Promise((resolve) => {
        const test = spawn('tsx', [testFile], {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env }
        });
        
        test.on('close', (code) => {
            console.log(code === 0 
                ? chalk.green(`${testName} PASSED\n`) 
                : chalk.red(`${testName} FAILED\n`));
            resolve(code === 0);
        });
        
        test.on('error', () => resolve(false));
    });
}

async function runTests() {
    printBanner();

    const requiresGoogleProvider = !platform || platform === 'web' || platform === 'electron' || platform === 'all';
    if (requiresGoogleProvider && !process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.log(chalk.red('Error: GOOGLE_API_KEY not set'));
        console.log('Set: export GOOGLE_API_KEY=your-key\n');
        process.exit(1);
    }
    
    const results: { name: string; passed: boolean }[] = [];
    
    if (!platform || platform === 'web' || platform === 'all') {
        const webSmokePassed = await runTest('tests/cli/web-test.ts', 'Web Platform Smoke');
        results.push({ name: 'Web Smoke', passed: webSmokePassed });

        const webFeaturesPassed = await runTest('tests/cli/web-features-test.ts', 'Web Platform Feature Suite');
        results.push({ name: 'Web Features', passed: webFeaturesPassed });
    }
    
    if (platform === 'electron' || platform === 'all') {
        const electronPassed = await runTest('tests/cli/electron-test.ts', 'Electron Platform');
        results.push({ name: 'Electron', passed: electronPassed });
    }

    if (platform === 'counter' || platform === 'all') {
        const counterPassed = await runTest('tests/cli/counter-scenario-test.ts', 'Counter Scenarios (Fast + Slow)');
        results.push({ name: 'Counter Scenarios', passed: counterPassed });
    }

    if (platform === 'recording' || platform === 'all') {
        const recordingPassed = await runTest('tests/cli/recording-scenario-test.ts', 'Recording Tools Scenario');
        results.push({ name: 'Recording Tools', passed: recordingPassed });
    }

    if (platform === 'shell' || platform === 'all') {
        const shellPassed = await runTest('tests/cli/shell-capability-test.ts', 'Shell Capability Gate');
        results.push({ name: 'Shell Capability', passed: shellPassed });
    }
    
    console.log(chalk.cyan('\nSummary:'));
    results.forEach(({ name, passed }) => {
        console.log(`${name}: ${passed ? chalk.green('PASS') : chalk.red('FAIL')}`);
    });
    
    const allPassed = results.every(r => r.passed);
    console.log(allPassed ? chalk.green('\nAll tests passed!') : chalk.red('\nSome tests failed'));
    process.exit(allPassed ? 0 : 1);
}

if (args.includes('--help') || args.includes('-h')) {
    printBanner();
    printUsage();
    process.exit(0);
}

runTests().catch(error => {
    console.error(chalk.red('Error:'), error);
    process.exit(1);
});
