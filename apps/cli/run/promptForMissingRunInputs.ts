import inquirer from 'inquirer';
import { CLI_DEFAULT_STEPS, CLI_DEFAULT_URL } from '@shared/defaults';
import { Platform } from '@domain/value-objects';

interface RunInputSeed {
    readonly url?: string;
    readonly prompt?: string;
    readonly steps?: string | number;
    readonly cdpUrl?: string;
    readonly executablePath?: string;
    readonly platformFlag?: string;
}

interface FilledRunInputs {
    url?: string | undefined;
    prompt?: string | undefined;
    steps?: string | number | undefined;
}

/**
 * Fills url/prompt/steps interactively only when the flags didn't already
 * supply enough to start (no target + no platform, or no prompt). Returns the
 * flag values untouched when nothing is missing.
 */
export async function promptForMissingRunInputs(seed: RunInputSeed): Promise<FilledRunInputs> {
    const { url, prompt, steps, cdpUrl, executablePath, platformFlag } = seed;

    const needsTarget = !url && !cdpUrl && !executablePath && !platformFlag;
    if (!needsTarget && prompt) {
        return { url, prompt, steps };
    }

    const noExplicitTarget = !url && !cdpUrl && !executablePath;
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'platformChoice',
            message: 'Select platform:',
            choices: [Platform.Web, 'electron (CDP)', 'electron (executable)'],
            when: needsTarget,
        },
        {
            type: 'input',
            name: 'url',
            message: 'Target URL:',
            default: CLI_DEFAULT_URL,
            when: (ans: Record<string, unknown>): boolean => noExplicitTarget && (!platformFlag || platformFlag === Platform.Web) && (ans['platformChoice'] === Platform.Web || !ans['platformChoice']),
        },
        {
            type: 'input',
            name: 'prompt',
            message: 'What should the agent do?',
            when: !prompt,
        },
        {
            type: 'number',
            name: 'steps',
            message: 'Max steps:',
            default: CLI_DEFAULT_STEPS,
            when: !steps,
        },
    ]);

    return {
        url: url || (answers['url'] as string | undefined),
        prompt: prompt || (answers['prompt'] as string | undefined),
        steps: steps || (answers['steps'] as string | number | undefined),
    };
}
