import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { LlmRuntimeConfigResolver, DEFAULT_ADC_CREDENTIALS_PATH } from '@infrastructure/llm/LlmRuntimeConfigResolver';

const ENV_KEYS = [
    'DOMIA_LLM_API_KEY', 'DOMIA_LLM_AUTH_MODE', 'DOMIA_LLM_MODEL',
    'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION',
];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function resolver(apiKey?: string): LlmRuntimeConfigResolver {
    return new LlmRuntimeConfigResolver(() => ({
        provider: 'google', model: 'gemini-2.5-flash', visionEnabled: false, debugScreenshots: false,
        ...(apiKey ? { apiKey } : {}),
    }));
}

describe('LLM auth mode resolution', () => {
    beforeEach(() => {
        for (const k of ENV_KEYS) delete process.env[k];
    });

    afterAll(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    it('prefers the API key when one is available', () => {
        const auth = resolver('key-123').resolve().auth;
        expect(auth).toEqual({ mode: 'api_key', apiKey: 'key-123' });
    });

    it('falls back to ADC from a service-account JSON, reading project_id from the file', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-adc-'));
        const credPath = path.join(dir, 'sa.json');
        await fs.writeJson(credPath, { type: 'service_account', project_id: 'my-gcp-project' });
        process.env['GOOGLE_APPLICATION_CREDENTIALS'] = credPath;

        const auth = resolver().resolve().auth;
        expect(auth).toEqual({ mode: 'adc', project: 'my-gcp-project', location: 'us-central1' });

        await fs.remove(dir);
    });

    it('honours explicit project/location over the credentials file', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-adc-'));
        const credPath = path.join(dir, 'sa.json');
        await fs.writeJson(credPath, { project_id: 'from-file' });
        process.env['GOOGLE_APPLICATION_CREDENTIALS'] = credPath;
        process.env['GOOGLE_CLOUD_PROJECT'] = 'explicit-project';
        process.env['GOOGLE_CLOUD_LOCATION'] = 'europe-west1';

        const auth = resolver().resolve().auth;
        expect(auth).toEqual({ mode: 'adc', project: 'explicit-project', location: 'europe-west1' });

        await fs.remove(dir);
    });

    it('forced adc mode without a project reports why it cannot run', () => {
        process.env['DOMIA_LLM_AUTH_MODE'] = 'adc';
        const auth = resolver('ignored-key').resolve().auth;
        expect(auth.mode).toBe('none');
        if (auth.mode === 'none') expect(auth.reason).toMatch(/project/i);
    });

    it.skipIf(fs.existsSync(DEFAULT_ADC_CREDENTIALS_PATH))('reports actionable guidance when nothing is configured', () => {
        const auth = resolver().resolve().auth;
        expect(auth.mode).toBe('none');
        if (auth.mode === 'none') expect(auth.reason).toMatch(/GOOGLE_API_KEY|gcp-credentials/);
    });
});
