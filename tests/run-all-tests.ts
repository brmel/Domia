#!/usr/bin/env node
import 'dotenv/config';
import { spawn } from 'child_process';
import chalk from 'chalk';

interface TestResult {
    name: string;
    passed: boolean;
    skipped: boolean;
    reason?: string;
}

async function runCommand(command: string, args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, NODE_OPTIONS: '--no-deprecation' }
        });
        
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
}

async function main() {
    console.log(chalk.cyan.bold('Domia Comprehensive Test Suite\n'));
    
    const results: TestResult[] = [];
    
    // 1. Unit Tests (Vitest)
    console.log(chalk.blue('━━━ Running Unit Tests (Vitest) ━━━\n'));
    const unitTestsPassed = await runCommand('npm', ['test']);
    results.push({
        name: 'Unit Tests (Vitest)',
        passed: unitTestsPassed,
        skipped: false
    });
    
    console.log('\n');
    
    // Check for API key
    const hasApiKey = process.env['GOOGLE_API_KEY'] || process.env['GEMINI_API_KEY'];
    
    if (!hasApiKey) {
        console.log(chalk.yellow('⚠️  GOOGLE_API_KEY not set - Skipping CLI tests\n'));
        console.log(chalk.gray('To run CLI tests, set your API key:'));
        console.log(chalk.gray('  export GOOGLE_API_KEY=your-api-key\n'));
        
        results.push({
            name: 'Web Platform Test',
            passed: false,
            skipped: true,
            reason: 'API key not set'
        });
        
        results.push({
            name: 'Electron CDP Test',
            passed: false,
            skipped: true,
            reason: 'API key not set'
        });
        
        results.push({
            name: 'Electron Executable Test',
            passed: false,
            skipped: true,
            reason: 'API key not set'
        });
    } else {
        // 2. Web Platform Test
        console.log(chalk.blue('━━━ Testing Web Platform ━━━\n'));
        const webTestPassed = await runCommand('tsx', ['tests/cli/web-test.ts']);
        results.push({
            name: 'Web Platform Test',
            passed: webTestPassed,
            skipped: false
        });
        
        console.log('\n');
        
        // 3. Electron Tests (both scenarios)
        console.log(chalk.blue('━━━ Testing Electron Platform (2 scenarios) ━━━\n'));
        const electronTestsPassed = await runCommand('tsx', ['tests/cli/electron-test.ts']);
        
        // Note: electron-test.ts runs both CDP and Executable scenarios
        results.push({
            name: 'Electron CDP Test',
            passed: electronTestsPassed,
            skipped: false
        });
        
        results.push({
            name: 'Electron Executable Test',
            passed: electronTestsPassed,
            skipped: false
        });
        
        console.log('\n');
    }
    
    // Summary
    console.log(chalk.cyan('━'.repeat(60)));
    console.log(chalk.bold('📊 Test Summary'));
    console.log(chalk.cyan('━'.repeat(60)));
    
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    
    results.forEach(({ name, passed, skipped, reason }) => {
        if (skipped) {
            console.log(`${name.padEnd(30)}: ${chalk.yellow('SKIPPED')}${reason ? ` (${reason})` : ''}`);
            totalSkipped++;
        } else if (passed) {
            console.log(`${name.padEnd(30)}: ${chalk.green('✓ PASS')}`);
            totalPassed++;
        } else {
            console.log(`${name.padEnd(30)}: ${chalk.red('✗ FAIL')}`);
            totalFailed++;
        }
    });
    
    console.log(chalk.cyan('━'.repeat(60)));
    console.log(chalk.bold(`Total: ${results.length} tests`));
    console.log(chalk.green(`Passed: ${totalPassed}`));
    console.log(chalk.red(`Failed: ${totalFailed}`));
    console.log(chalk.yellow(`Skipped: ${totalSkipped}`));
    console.log(chalk.cyan('━'.repeat(60)));
    
    if (totalFailed === 0 && totalSkipped === 0) {
        console.log(chalk.green.bold('\n🎉 All tests passed!\n'));
        process.exit(0);
    } else if (totalFailed === 0) {
        console.log(chalk.yellow.bold(`\n⚠️  All runnable tests passed, but ${totalSkipped} skipped\n`));
        process.exit(0);
    } else {
        console.log(chalk.red.bold(`\n❌ ${totalFailed} test(s) failed\n`));
        process.exit(1);
    }
}

main().catch(error => {
    console.error(chalk.red('Test runner error:'), error);
    process.exit(1);
});
