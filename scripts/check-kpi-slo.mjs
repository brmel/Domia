#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();

const checks = [
    {
        file: 'src/application/use-cases/RunUseCase.ts',
        required: [
            "type: 'replanning'",
            "type: 'recovery_replay'"
        ]
    },
    {
        file: 'src/application/services/execution/ReplanningPolicyService.ts',
        required: [
            'maxReplansPerRun',
            'Active replanning approved'
        ]
    }
];

async function main() {
    const violations = [];

    for (const check of checks) {
        const absolutePath = path.join(rootDir, check.file);
        const content = await fs.readFile(absolutePath, 'utf8');

        for (const marker of check.required) {
            if (!content.includes(marker)) {
                violations.push(`${check.file}: missing KPI/SLO marker '${marker}'`);
            }
        }
    }

    if (violations.length > 0) {
        console.error('KPI/SLO guardrail checks failed:');
        for (const violation of violations) {
            console.error(`- ${violation}`);
        }
        process.exit(1);
    }

    console.log('KPI/SLO guardrail checks passed.');
}

main().catch((error) => {
    console.error('[check-kpi-slo] failed', error);
    process.exit(1);
});
