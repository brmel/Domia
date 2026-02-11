#!/usr/bin/env node
/**
 * Unified CLI Test Runner
 * 
 * Runs all CLI-based production tests:
 * - Test A: Web platform (google.com)
 * - Test B1: Electron CDP mode  
 * - Test B2: Electron Executable mode
 * 
 * These tests use the actual production CLI to validate real user scenarios
 * 
 * Usage:
 *   npm run test:cli              # Run all tests
 *   npm run test:cli -- web       # Web only
 *   npm run test:cli -- electron  # Electron only
 */
import { spawn } from 'child_process';
import chalk from 'chalk';

const args = process.argv.slice(2);
const platform = args.find(arg => !arg.startsWith('--'));

function printBanner() {
    console.log(chalk.cyan('╔═══════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║       Domia CLI Production Test Runner           ║'));
    console.log(chalk.cyan('╚═══════════════════════════════════════════════════╝\n'));
}

function printUsage() {
    console.log(chalk.bold('Usage:'));
    console.log('  npm run test:cli              # Run all CLI tests');
    console.log('  npm run test:cli -- web       # Web platform only');
    console.log('  npm run test:cli -- electron  # Electron platform only\n');
}

function printArchitecture() {
    console.log(chalk.bold('Architecture:'));
    console.log('  ✓ Uses actual production CLI (npm run cli)');
    console.log('  ✓ Tests real user code paths');
    console.log('  ✓ No mocks or test frameworks needed');
    console.log('  ✓ Domia tests itself (true dogfooding)\n');
}

function printPrerequisites() {
    console.log(chalk.yellow('Prerequisites:'));
    console.log('  ✓ GOOGLE_API_KEY environment variable must be set');
    console.log('  ✓ Web tests: No additional setup needed');
    console.log('  ✓ Electron tests: App will be built automatically if needed\n');
}

async function runTest(testFile: string, testName: string): Promise<boolean> {
    console.log(chalk.blue(`\n▶️  Running ${testName}...\n`));
    
    return new Promise((resolve) => {
        const test = spawn('tsx', [testFile], {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env }
        });
        
        test.on('close', (code) => {
            if (code === 0) {
                console.log(chalk.green(`\n✅ ${testName} PASSED\n`));
                resolve(true);
            } else {
                console.log(chalk.red(`\n❌ ${testName} FAILED\n`));
                resolve(false);
            }
        });
        
        test.on('error', (error) => {
            console.error(chalk.red(`Failed to run ${testName}:`), error);
            resolve(false);
        });
    });
}

async function runTests() {
    printBanner();
    
    // Check for API key
    if (!process.env['GOOGLE_API_KEY'] && !process.env['GEMINI_API_KEY']) {
        console.log(chalk.red('❌ Error: GOOGLE_API_KEY environment variable not set\n'));
        console.log(chalk.yellow('Please set your API key:'));
        console.log(chalk.gray('  export GOOGLE_API_KEY=your-api-key\n'));
        process.exit(1);
    }
    
    console.log(chalk.green('✅ API key found\n'));
    
    printArchitecture();
    printPrerequisites();
    
    const results: { name: string; passed: boolean }[] = [];
    
    // Determine which tests to run
    if (!platform || platform === 'web' || platform === 'all') {
        console.log(chalk.cyan('═'.repeat(60)));
        console.log(chalk.cyan('TEST SUITE A: Web Platform'));
        console.log(chalk.cyan('═'.repeat(60)));
        
        const webPassed = await runTest('tests/cli/web-test.ts', 'Test A: Web Platform');
        results.push({ name: 'Web Platform', passed: webPassed });
    }
    
    if (!platform || platform === 'electron' || platform === 'all') {
        console.log(chalk.cyan('═'.repeat(60)));
        console.log(chalk.cyan('TEST SUITE B: Electron Platform'));
        console.log(chalk.cyan('═'.repeat(60)));
        
        const electronPassed = await runTest('tests/cli/electron-test.ts', 'Test B: Electron Platform');
        results.push({ name: 'Electron Platform', passed: electronPassed });
    }
    
    // Print summary
    console.log('\n' + chalk.cyan('═'.repeat(60)));
    console.log(chalk.bold('📊 TEST SUMMARY'));
    console.log(chalk.cyan('═'.repeat(60)));
    
    results.forEach(({ name, passed }) => {
        const status = passed ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
        console.log(`${name.padEnd(20)}: ${status}`);
    });
    
    console.log(chalk.cyan('═'.repeat(60)) + '\n');
    
    const allPassed = results.every(r => r.passed);
    
    if (allPassed) {
        console.log(chalk.green.bold('🎉 ALL TESTS PASSED!\n'));
        console.log(chalk.gray('Production CLI is working correctly'));
        console.log(chalk.gray('All user scenarios validated\n'));
        process.exit(0);
    } else {
        console.log(chalk.red.bold('❌ SOME TESTS FAILED\n'));
        printUsage();
        process.exit(1);
    }
}

// Handle help flag
if (args.includes('--help') || args.includes('-h')) {
    printBanner();
    printUsage();
    printArchitecture();
    printPrerequisites();
    process.exit(0);
}

// Run tests
runTests().catch(error => {
    console.error(chalk.red('Test runner error:'), error);
    process.exit(1);
});
