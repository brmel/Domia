#!/usr/bin/env node
import { spawn } from 'child_process';

function parseProfile() {
    const profileArg = process.argv.find((arg) => arg.startsWith('--profile='));
    const profile = profileArg ? profileArg.split('=')[1] : process.env.DOMIA_ENV_PROFILE || 'staging';
    if (profile !== 'dev' && profile !== 'staging' && profile !== 'production') {
        throw new Error(`Unsupported readiness profile '${profile}'. Use dev|staging|production.`);
    }

    return profile;
}

function runCommand(command, args, env) {
    return new Promise((resolve) => {
        const proc = spawn(command, args, {
            stdio: 'inherit',
            env
        });

        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
}

async function main() {
    const profile = parseProfile();

    const readinessEnv = {
        ...process.env,
        DOMIA_ENV_PROFILE: profile,
        DOMIA_ENABLE_READINESS_GATES: profile === 'dev' ? (process.env.DOMIA_ENABLE_READINESS_GATES ?? 'false') : 'true',
        DOMIA_READINESS_MODE: profile === 'production' ? 'soft-enforce' : (process.env.DOMIA_READINESS_MODE ?? 'observe')
    };

    const checks = [
        ['npm', ['run', 'typecheck']],
        ['npm', ['run', 'check:architecture']],
        ['npm', ['run', 'check:code-markers']],
        ['npm', ['test']]
    ];

    for (const [command, args] of checks) {
        const passed = await runCommand(command, args, readinessEnv);
        if (!passed) {
            process.exit(1);
        }
    }

    process.exit(0);
}

main().catch((error) => {
    console.error('[readiness-gate] failed', error);
    process.exit(1);
});
