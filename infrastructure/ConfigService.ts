import { cosmiconfigSync } from 'cosmiconfig';
import { injectable, inject } from 'tsyringe';
import fs from 'fs-extra';
import path from 'path';
import {
    DomiaConfigSchema,
    type DomiaConfig,
    type AiConfig,
    type PathsConfig,
    type PromptOverrides,
} from '@shared/contracts/config';

import { IConfigService } from '@domain/ports/platform/IConfigService';
import type { ILogger } from '@domain/ports/platform/ILogger';
import { CONFIG_FILE_NAME } from '@shared/defaults';

@injectable()
export class ConfigService implements IConfigService {
    private config: DomiaConfig;
    private configPath: string;

    private resolveApiKey(fileApiKey?: string): string | undefined {
        return process.env['GOOGLE_API_KEY']
            ?? process.env['GEMINI_API_KEY']
            ?? fileApiKey;
    }

    constructor(
        @inject('ILogger') private readonly logger: ILogger,
    ) {
        const explorer = cosmiconfigSync('domia', {
            searchPlaces: [
                'package.json',
                '.domiarc',
                '.domiarc.json',
                '.domiarc.yaml',
                '.domiarc.yml',
                '.domiarc.js',
                '.domiarc.cjs',
                'domia.config.js',
                'domia.config.cjs',
                'domia.config.json',
            ],
        });
        const result = explorer.search();

        let loadedConfig = {};
        if (result && result.config) {
            loadedConfig = result.config;
            this.configPath = result.filepath;
        } else {
            this.configPath = path.resolve(process.cwd(), CONFIG_FILE_NAME);
        }

        const parsedFile = DomiaConfigSchema.parse(loadedConfig);

        parsedFile.ai.apiKey = this.resolveApiKey(parsedFile.ai.apiKey);

        this.config = parsedFile;
    }

    get(): DomiaConfig {
        return this.config;
    }

    getAi(): AiConfig {
        return this.config.ai;
    }

    getPaths(): PathsConfig {
        return this.config.paths;
    }

    getPromptOverrides(): PromptOverrides {
        return this.config.promptOverrides;
    }

    update(updates: Partial<DomiaConfig>): void {
        this.applyUpdates(updates);
        this.save();
    }

    updateTransient(updates: Partial<DomiaConfig>): void {
        this.applyUpdates(updates);
        // Intentionally NOT calling save() — transient overrides must never be
        // written back to domia.config.json.
    }

    private applyUpdates(updates: Partial<DomiaConfig>): void {
        this.config = {
            ...this.config,
            ...updates,
            ai: { ...this.config.ai, ...updates.ai },
            viewport: { ...this.config.viewport, ...updates.viewport },
            paths: { ...this.config.paths, ...updates.paths },
            limits: { ...this.config.limits, ...updates.limits },
            promptOverrides: updates.promptOverrides !== undefined
                ? updates.promptOverrides
                : this.config.promptOverrides,
            plugins: updates.plugins !== undefined
                ? {
                    ...this.config.plugins,
                    ...updates.plugins,
                    shell: { ...this.config.plugins.shell, ...updates.plugins.shell },
                }
                : this.config.plugins,
            reporting: updates.reporting !== undefined
                ? { ...this.config.reporting, ...updates.reporting }
                : this.config.reporting,
        };
    }

    private save(): void {
        try {
            const configToSave: DomiaConfig = {
                ...this.config,
                ai: {
                    ...this.config.ai,
                    apiKey: undefined
                }
            };

            fs.writeJsonSync(this.configPath, configToSave, { spaces: 2 });
        } catch (error) {
            this.logger.error('[ConfigService] Failed to persist config', error);
        }
    }
}
