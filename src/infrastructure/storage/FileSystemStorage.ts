import { injectable, inject } from 'tsyringe';
import fs from 'fs-extra';
import path from 'path';
import { ConfigService } from '../config/ConfigService';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { TimelineContextWindow } from '@domain/value-objects/TemporalObservation';

import { IStorageService } from '@domain/ports/IStorageService';

@injectable()
export class FileSystemStorage implements IStorageService {
    private static readonly DEFAULT_TEMPORAL_RETENTION_COUNT = 30;

    constructor(
        @inject(ConfigService) private configService: ConfigService
    ) { }

    async savePerceptionAssets(runId: string, stepNumber: number, frame: PerceptionFrame): Promise<Record<string, string>> {
        const config = this.configService.get();
        const baseDir = path.resolve(config.paths.artifactsDir, runId, 'steps');
        await fs.ensureDir(baseDir);

        const assets: Record<string, string> = {};

        // Save Screenshots
        if (frame.vision.screenshots && frame.vision.screenshots.length > 0) {
            for (let i = 0; i < frame.vision.screenshots.length; i++) {
                const buffer = frame.vision.screenshots[i];
                if (!buffer) continue;
                const filename = i === 0 ? `${stepNumber}_screenshot.jpg` : `${stepNumber}_screenshot_${i}.jpg`;
                const filePath = path.join(baseDir, filename);
                await fs.writeFile(filePath, buffer);
                if (i === 0) assets['screenshot'] = filePath; // Primary
                assets[`screenshot_${i}`] = filePath;
            }
        }

        // Save DOM
        if (frame.semantic.dom && Object.keys(frame.semantic.dom).length > 0) {
            const filename = `${stepNumber}_dom.json`;
            const filePath = path.join(baseDir, filename);
            await fs.writeJson(filePath, frame.semantic.dom, { spaces: 2 });
            assets['dom'] = filePath;
        }

        // Save Accessibility
        if (frame.semantic.accessibility && Object.keys(frame.semantic.accessibility).length > 0) {
            const filename = `${stepNumber}_aria.json`;
            const filePath = path.join(baseDir, filename);
            await fs.writeJson(filePath, frame.semantic.accessibility, { spaces: 2 });
            assets['accessibility'] = filePath;
        }

        return assets;
    }

    async saveStepTrace(runId: string, stepNumber: number, trace: any): Promise<void> {
        const config = this.configService.get();
        const baseDir = path.resolve(config.paths.artifactsDir, runId, 'steps');
        await fs.ensureDir(baseDir);

        const filename = `${stepNumber}_trace.json`;
        const filePath = path.join(baseDir, filename);

        let existing = {};
        if (await fs.pathExists(filePath)) {
            existing = await fs.readJson(filePath);
        }

        await fs.writeJson(filePath, { ...existing, ...trace }, { spaces: 2 });
    }

    async saveTemporalWindow(runId: string, stepNumber: number, temporalWindow: TimelineContextWindow): Promise<Record<string, string>> {
        const config = this.configService.get();
        const baseDir = path.resolve(config.paths.artifactsDir, runId, 'steps');
        await fs.ensureDir(baseDir);

        const filename = `${stepNumber}_timeline.json`;
        const filePath = path.join(baseDir, filename);
        await fs.writeJson(filePath, temporalWindow, { spaces: 2 });
        await this.pruneTemporalWindows(baseDir, this.resolveTemporalRetentionCount(config));

        return {
            timeline: filePath
        };
    }

    private resolveTemporalRetentionCount(config: ReturnType<ConfigService['get']>): number {
        const configuredValue = config.limits?.temporalWindowRetentionCount;
        if (!Number.isFinite(configuredValue) || !configuredValue || configuredValue <= 0) {
            return FileSystemStorage.DEFAULT_TEMPORAL_RETENTION_COUNT;
        }

        return Math.floor(configuredValue);
    }

    private async pruneTemporalWindows(baseDir: string, retentionCount: number): Promise<void> {
        if (retentionCount <= 0) {
            return;
        }

        const files = await fs.readdir(baseDir);
        const temporalFiles = files
            .map((name) => {
                const match = /^(\d+)_timeline\.json$/.exec(name);
                if (!match || !match[1]) {
                    return undefined;
                }

                return {
                    name,
                    stepNumber: Number(match[1])
                };
            })
            .filter((entry): entry is { name: string; stepNumber: number } => Boolean(entry))
            .sort((left, right) => right.stepNumber - left.stepNumber);

        const filesToDelete = temporalFiles.slice(retentionCount);
        for (const file of filesToDelete) {
            await fs.remove(path.join(baseDir, file.name));
        }
    }

    async getStepArtifacts(runId: string, stepNumber: number): Promise<{
        screenshots?: string[];
        dom?: any;
        accessibility?: any;
        trace?: any;
        temporalWindow?: TimelineContextWindow;
    }> {
        const config = this.configService.get();
        const baseDir = path.resolve(config.paths.artifactsDir, runId, 'steps');

        // Security check: ensure baseDir is within artifactsDir to prevent traversal
        if (!baseDir.startsWith(path.resolve(config.paths.artifactsDir))) {
            throw new Error("Invalid runId");
        }

        const artifacts: any = {};

        // 1. Screenshots (Scan directory)
        if (await fs.pathExists(baseDir)) {
            const files = await fs.readdir(baseDir);
            const screenshotFiles = files
                .filter(f => f.startsWith(`${stepNumber}_screenshot`) && f.endsWith('.jpg'))
                .sort((a, b) => {
                    // Sort primarily by length (shorter first: _screenshot.jpg vs _screenshot_1.jpg)
                    // Then alphanumerically
                    if (a.length !== b.length) return a.length - b.length;
                    return a.localeCompare(b);
                });

            if (screenshotFiles.length > 0) {
                artifacts.screenshots = await Promise.all(screenshotFiles.map(async (f) => {
                    const filePath = path.join(baseDir, f);
                    const buffer = await fs.readFile(filePath);
                    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
                }));
            }
        }

        // 2. DOM
        const domPath = path.join(baseDir, `${stepNumber}_dom.json`);
        if (await fs.pathExists(domPath)) {
            artifacts.dom = await fs.readJson(domPath);
        }

        // 3. Accessibility
        const ariaPath = path.join(baseDir, `${stepNumber}_aria.json`);
        if (await fs.pathExists(ariaPath)) {
            artifacts.accessibility = await fs.readJson(ariaPath);
        }

        // 4. Trace
        const tracePath = path.join(baseDir, `${stepNumber}_trace.json`);
        if (await fs.pathExists(tracePath)) {
            artifacts.trace = await fs.readJson(tracePath);
        }

        const timelinePath = path.join(baseDir, `${stepNumber}_timeline.json`);
        if (await fs.pathExists(timelinePath)) {
            artifacts.temporalWindow = await fs.readJson(timelinePath);
        }

        return artifacts;
    }
}
