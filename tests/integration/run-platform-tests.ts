#!/usr/bin/env node
/**
 * Platform Test Runner
 * 
 * CLI tool to run integration tests for Web and Electron platforms
 * 
 * Usage:
 *   npm run test:platforms              # Run all platform tests
 *   npm run test:platforms -- web       # Run only web tests
 *   npm run test:platforms -- electron  # Run only electron tests
 *   npm run test:platforms -- --watch   # Run in watch mode
 */
import { spawn } from 'child_process';
import chalk from 'chalk';

const args = process.argv.slice(2);
const platform = args.find(arg => !arg.startsWith('--'));
const watchMode = args.includes('--watch');
const verbose = args.includes('--verbose');

function printBanner() {
    console.log(chalk.cyan('╔═══════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║     Domia Platform Integration Test Runner       ║'));
    console.log(chalk.cyan('╚═══════════════════════════════════════════════════╝\n'));
}

function printUsage() {
    console.log(chalk.bold('Usage:'));
    console.log('  npm run test:platforms              # Run all tests');
    console.log('  npm run test:platforms -- web       # Web platform only');
    console.log('  npm run test:platforms -- electron  # Electron platform only');
    console.log('  npm run test:platforms -- --watch   # Watch mode');
    console.log('  npm run test:platforms -- --verbose # Verbose output\n');
}

function printPrerequisites() {
    console.log(chalk.yellow('Prerequisites:'));
    console.log('  ✓ GOOGLE_API_KEY environment variable must be set');
    console.log('  ✓ Web tests: No additional setup needed');
    console.log('  ✓ Electron CDP tests: Run "npm run dev" in another terminal');
    console.log('  ✓ Electron Executable tests: Run "npm run build" first\n');
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

    printPrerequisites();

    // Determine which tests to run
    let testPattern = 'platform-tests/*.integration.test.ts';
    
    if (platform === 'web') {
        testPattern = 'platform-tests/web-platform.integration.test.ts';
        console.log(chalk.blue('🌐 Running Web Platform Tests\n'));
    } else if (platform === 'electron') {
        testPattern = 'platform-tests/electron-platform.integration.test.ts';
        console.log(chalk.blue('⚡ Running Electron Platform Tests\n'));
    } else {
        console.log(chalk.blue('🚀 Running All Platform Tests\n'));
    }

    // Build vitest command
    const vitestArgs = [
        'run',
        '--config',
        'vitest.integration.config.ts',
        '--',
        `tests/integration/${testPattern}`
    ];

    if (watchMode) {
        vitestArgs[0] = 'watch';
        console.log(chalk.gray('👀 Watch mode enabled\n'));
    }

    if (verbose) {
        vitestArgs.push('--reporter=verbose');
    }

    // Run vitest
    const vitest = spawn('npx', ['vitest', ...vitestArgs], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }
    });

    vitest.on('close', (code) => {
        console.log('\n' + '═'.repeat(55));
        
        if (code === 0) {
            console.log(chalk.green('\n✅ All tests passed!\n'));
        } else {
            console.log(chalk.red('\n❌ Some tests failed\n'));
            printUsage();
        }

        process.exit(code || 0);
    });

    vitest.on('error', (error) => {
        console.error(chalk.red('Failed to start test runner:'), error);
        process.exit(1);
    });
}

// Handle help flag
if (args.includes('--help') || args.includes('-h')) {
    printBanner();
    printUsage();
    printPrerequisites();
    process.exit(0);
}

// Run tests
runTests().catch(error => {
    console.error(chalk.red('Test runner error:'), error);
    process.exit(1);
});
