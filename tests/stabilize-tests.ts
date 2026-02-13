
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const RUNS = 1;
const LOG_DIR = 'test-logs';

async function runTest(index: number) {
    console.log(`\n=== Starting Run ${index + 1}/${RUNS} ===`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    return new Promise<void>((resolve) => {
        const proc = spawn('npx', ['tsx', 'tests/run-all-tests.ts'], {
            stdio: 'pipe',
            shell: true,
            env: { ...process.env, FORCE_COLOR: '3' }
        });

        let output = '';

        proc.stdout.on('data', (data) => {
            process.stdout.write(data);
            output += data.toString();
        });

        proc.stderr.on('data', (data) => {
            process.stderr.write(data);
            output += data.toString();
        });

        proc.on('close', (code) => {
            const status = code === 0 ? 'PASS' : 'FAIL';
            const filename = join(LOG_DIR, `run-${index + 1}-${status}-${timestamp}.log`);
            try {
                mkdirSync(LOG_DIR, { recursive: true });
                writeFileSync(filename, output);
                console.log(`\nLogs saved to ${filename}`);
            } catch (err) {
                console.error('Failed to save logs', err);
            }
            resolve();
        });
    });
}

async function main() {
    for (let i = 0; i < RUNS; i++) {
        await runTest(i);
        // Small delay between runs to allow port release
        await new Promise(r => setTimeout(r, 2000));
    }
}

main();
