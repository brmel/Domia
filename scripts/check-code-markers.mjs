#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();

const checks = [
    {
        file: 'src/application/use-cases/RunUseCase.ts',
        required: [
            "type: 'replanning'",
            'ExecutionGraph',
            'ExecutionGraph.selectNextReadyNode',
        ],
        forbidden: [/for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*plan\.items\.length\s*;\s*i\+\+\s*\)/],
    },
    {
        file: 'src/application/services/execution/ReplanningPolicyService.ts',
        required: [
            'maxReplansPerRun',
            'Active replanning approved',
        ],
        forbidden: [],
    },
    {
        file: 'src/application/services/workflow/WorkflowRunOrchestratorService.ts',
        required: [
            'ExecutionGraph',
            'ExecutionGraph.selectNextReadyNode',
        ],
        forbidden: [/for\s*\(\s*let\s+stepIndex\s*=\s*0\s*;\s*stepIndex\s*<\s*definition\.steps\.length\s*;\s*stepIndex\+\+\s*\)/],
    },
];

async function main() {
    const violations = [];

    for (const check of checks) {
        const absolutePath = path.join(rootDir, check.file);
        const content = await fs.readFile(absolutePath, 'utf8');

        for (const marker of check.required) {
            if (!content.includes(marker)) {
                violations.push(`${check.file}: missing required marker '${marker}'`);
            }
        }

        for (const pattern of check.forbidden) {
            if (pattern.test(content)) {
                violations.push(`${check.file}: contains forbidden pattern ${pattern}`);
            }
        }
    }

    if (violations.length > 0) {
        console.error('Code marker checks failed:');
        for (const violation of violations) {
            console.error(`- ${violation}`);
        }
        process.exit(1);
    }

    console.log('Code marker checks passed.');
}

main().catch((error) => {
    console.error('[check-code-markers] failed', error);
    process.exit(1);
});
