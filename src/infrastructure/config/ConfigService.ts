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

    private resolveApiKey(fileApiKey?: string): string | undefined {
        return process.env['GOOGLE_API_KEY']
            ?? process.env['GEMINI_API_KEY']
            ?? fileApiKey;
    }

    constructor() {
        const explorer = cosmiconfigSync('domia');
        const result = explorer.search();

        let loadedConfig = {};
        if (result && result.config) {
            loadedConfig = result.config;
            this.configPath = result.filepath;
        } else {
            this.configPath = path.resolve(process.cwd(), 'domia.config.json');
        }

        const parsedFile = DomiaConfigSchema.parse(loadedConfig);

        parsedFile.ai.apiKey = this.resolveApiKey(parsedFile.ai.apiKey);

        this.config = parsedFile;
    }

    get(): DomiaConfig {
        return this.config;
    }

    update(updates: Partial<DomiaConfig>): void {
        this.config = {
            ...this.config,
            ...updates,
            ai: { ...this.config.ai, ...updates.ai },
            selectorEngine: { ...this.config.selectorEngine, ...updates.selectorEngine },
            viewport: { ...this.config.viewport, ...updates.viewport },
            paths: { ...this.config.paths, ...updates.paths },
            limits: { ...this.config.limits, ...updates.limits },
            verification: { ...this.config.verification, ...updates.verification },
            rollout: {
                ...this.config.rollout,
                ...updates.rollout,
                agenticRuntime: {
                    ...this.config.rollout.agenticRuntime,
                    ...updates.rollout?.agenticRuntime,
                    sloGates: {
                        ...this.config.rollout.agenticRuntime.sloGates,
                        ...updates.rollout?.agenticRuntime?.sloGates,
                        thresholds: {
                            ...this.config.rollout.agenticRuntime.sloGates.thresholds,
                            ...updates.rollout?.agenticRuntime?.sloGates?.thresholds,
                        },
                    },
                },
            },
        };

        this.save();
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
            console.error('Failed to save config:', error);
        }
    }
}
