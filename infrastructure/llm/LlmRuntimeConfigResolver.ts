import { inject, injectable } from 'tsyringe';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AiConfigProvider } from '@shared/contracts/config';
import { DEFAULT_THINKING_BUDGET, DEFAULT_VERTEX_LOCATION } from '@shared/defaults';

export type LlmAuth =
    | { readonly mode: 'api_key'; readonly apiKey: string }
    | { readonly mode: 'adc'; readonly project: string; readonly location: string }
    | { readonly mode: 'none'; readonly reason: string };

interface LLMConfig {
    readonly model: string;
    readonly auth: LlmAuth;
    readonly thinkingBudget: number;
}

/** Drop a GCP service-account JSON here and ADC mode works with zero env setup. */
export const DEFAULT_ADC_CREDENTIALS_PATH = join(homedir(), '.domia', 'gcp-credentials.json');

const NO_AUTH_HELP =
    'No Gemini credentials. Either set an API key (GOOGLE_API_KEY / GEMINI_API_KEY / DOMIA_LLM_API_KEY, '
    + 'or ai.apiKey in domia.config.json), or use a GCP service account: point '
    + `GOOGLE_APPLICATION_CREDENTIALS at its JSON file, or save it as ${DEFAULT_ADC_CREDENTIALS_PATH}.`;

@injectable()
export class LlmRuntimeConfigResolver {
    constructor(
        @inject('AiConfigProvider') private readonly ai: AiConfigProvider
    ) {}

    resolve(): LLMConfig {
        const ai = this.ai();
        const model = process.env['DOMIA_LLM_MODEL'] || ai.model;

        const thinkingRaw = process.env['DOMIA_THINKING_BUDGET'];
        const parsed = thinkingRaw ? Number.parseInt(thinkingRaw, 10) : DEFAULT_THINKING_BUDGET;
        const thinkingBudget = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THINKING_BUDGET;

        return { model, thinkingBudget, auth: this.resolveAuth(ai.apiKey) };
    }

    private resolveAuth(configApiKey: string | undefined): LlmAuth {
        const apiKey = process.env['DOMIA_LLM_API_KEY'] || configApiKey;
        const forced = process.env['DOMIA_LLM_AUTH_MODE'];

        if (forced === 'api_key') {
            return apiKey ? { mode: 'api_key', apiKey } : { mode: 'none', reason: 'DOMIA_LLM_AUTH_MODE=api_key but no API key is set.' };
        }
        if (forced === 'adc') return this.resolveAdc();

        if (apiKey) return { mode: 'api_key', apiKey };
        const adc = this.resolveAdc();
        return adc.mode === 'adc' ? adc : { mode: 'none', reason: NO_AUTH_HELP };
    }

    private resolveAdc(): LlmAuth {
        const credentialsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS']
            || (existsSync(DEFAULT_ADC_CREDENTIALS_PATH) ? DEFAULT_ADC_CREDENTIALS_PATH : undefined);
        if (credentialsPath && !process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
            process.env['GOOGLE_APPLICATION_CREDENTIALS'] = credentialsPath;
        }

        const project = process.env['GOOGLE_CLOUD_PROJECT'] || this.projectFromCredentials(credentialsPath);
        if (!project) {
            return {
                mode: 'none',
                reason: 'ADC selected but no project found. Set GOOGLE_CLOUD_PROJECT, or use a service-account JSON containing project_id.',
            };
        }
        return { mode: 'adc', project, location: process.env['GOOGLE_CLOUD_LOCATION'] || DEFAULT_VERTEX_LOCATION };
    }

    private projectFromCredentials(credentialsPath: string | undefined): string | undefined {
        if (!credentialsPath || !existsSync(credentialsPath)) return undefined;
        try {
            const parsed = JSON.parse(readFileSync(credentialsPath, 'utf8')) as { project_id?: string };
            return parsed.project_id;
        } catch {
            return undefined;
        }
    }
}
