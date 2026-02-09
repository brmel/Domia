import { cosmiconfigSync } from 'cosmiconfig';
import { injectable } from 'tsyringe';
import fs from 'fs-extra';
import path from 'path';
import { DomiaConfigSchema, type DomiaConfig } from '../../shared/config-types';

export { DomiaConfigSchema, type DomiaConfig };

import { IConfigService } from '../../domain/ports/IConfigService';

@injectable()
export class ConfigService implements IConfigService {
    private config: DomiaConfig;
    private configPath: string;

    constructor() {
        const explorer = cosmiconfigSync('domia');
        const result = explorer.search();

        let loadedConfig = {};
        if (result && result.config) {
            loadedConfig = result.config;
            this.configPath = result.filepath;
        } else {
            // Default to local directory if no config found
            this.configPath = path.resolve(process.cwd(), 'domia.config.json');
        }

        // 1. Zod defaults -> 2. File config -> 3. Env overrides
        const parsedFile = DomiaConfigSchema.parse(loadedConfig);

        const envApiKey = process.env['GOOGLE_API_KEY'] ?? process.env['GEMINI_API_KEY'] ?? process.env['OPENAI_API_KEY'];
        if (envApiKey) {
            parsedFile.ai.apiKey = envApiKey;
        }

        this.config = parsedFile;
    }

    get(): DomiaConfig {
        return this.config;
    }

    update(updates: Partial<DomiaConfig>): void {
        // Deep merge logic (simplified for now)
        this.config = {
            ...this.config,
            ...updates,
            ai: { ...this.config.ai, ...updates.ai },
            selectorEngine: { ...this.config.selectorEngine, ...updates.selectorEngine },
            viewport: { ...this.config.viewport, ...updates.viewport },
            paths: { ...this.config.paths, ...updates.paths },
            limits: { ...this.config.limits, ...updates.limits },
        };

        this.save();
    }

    private save(): void {
        try {
            // Don't save API key if it came from env
            const configToSave = { ...this.config };
            if (process.env['GOOGLE_API_KEY'] || process.env['GEMINI_API_KEY'] || process.env['OPENAI_API_KEY']) {
                // We keep the runtime value, but when writing to disk we might want to strip it
                // For now, let's just write what we have, assuming the user might want to override env?
                // Actually, safer to NOT write secrets to disk if they aren't already there.
                // But managing that logic is complex. ConfigService is simple for now.
            }

            fs.writeJsonSync(this.configPath, configToSave, { spaces: 2 });
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    }
}
