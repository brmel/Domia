import { injectable, inject } from 'tsyringe';
import fs from 'fs-extra';
import path from 'path';
import { ConfigService } from '../config/ConfigService';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';

import type { StepTrace } from '@domain/ports/ITraceService';
import { IStorageService, StepArtifacts } from '@domain/ports/IStorageService';

@injectable()
export class FileSystemStorage implements IStorageService {

    constructor(
        @inject(ConfigService) private configService: ConfigService
    ) { }

    async savePerceptionAssets(runId: string, stepNumber: number, frame: PerceptionFrame): Promise<Record<string, string>> {
        const config = this.configService.get();
        const baseDir = path.resolve(config.paths.artifactsDir, runId, 'steps');
        await fs.ensureDir(baseDir);

        const assets: Record<string, string> = {};

        if (frame.vision.screenshots && frame.vision.screenshots.length > 0) {
            const screenshotWrites = frame.vision.screenshots.map(async (buffer, index) => {
                if (!buffer) {
                    return undefined;
                }

                const filename = index === 0 ? `${stepNumber}_screenshot.jpg` : `${stepNumber}_screenshot_${index}.jpg`;
                const filePath = path.join(baseDir, filename);
                await fs.writeFile(filePath, buffer);

                return { index, filePath };
            });

            const screenshotResults = (await Promise.all(screenshotWrites)).filter(
                (value): value is { index: number; filePath: string } => Boolean(value)
            );

            for (const result of screenshotResults) {
                if (result.index === 0) {
                    assets['screenshot'] = result.filePath;
                }
                assets[`screenshot_${result.index}`] = result.filePath;
            }
        }

        if (frame.semantic.ariaSnapshot) {
            const filename = `${stepNumber}_aria.txt`;
            const filePath = path.join(baseDir, filename);
            await fs.writeFile(filePath, frame.semantic.ariaSnapshot, 'utf-8');
            assets['ariaSnapshot'] = filePath;
        }

        return assets;
    }

    async saveStepTrace(runId: string, stepNumber: number, trace: Partial<StepTrace>): Promise<void> {
        const config = this.configService.get();
        const baseDir = path.resolve(config.paths.artifactsDir, runId, 'steps');
        await fs.ensureDir(baseDir);

        const filename = `${stepNumber}_trace.json`;
        const filePath = path.join(baseDir, filename);

        let existing: { events?: unknown[]; [key: string]: unknown } = {};
        if (await fs.pathExists(filePath)) {
            const current = await fs.readJson(filePath);
            if (this.isRecord(current)) {
                existing = current;
            }
        }

        const existingEvents = Array.isArray(existing.events) ? existing.events : [];
        const materializedExisting: { [key: string]: unknown } = { ...existing };
        delete materializedExisting['events'];

        await fs.writeJson(
            filePath,
            {
                ...materializedExisting,
                ...trace,
                events: [...existingEvents, { timestamp: Date.now(), ...trace }]
            },
            { spaces: 2 }
        );
    }

    async getStepArtifacts(runId: string, stepNumber: number): Promise<StepArtifacts> {
        const config = this.configService.get();
        const baseDir = path.resolve(config.paths.artifactsDir, runId, 'steps');

        if (!baseDir.startsWith(path.resolve(config.paths.artifactsDir))) {
            throw new Error("Invalid runId");
        }

        const artifacts: StepArtifacts = {};

        if (await fs.pathExists(baseDir)) {
            const files = await fs.readdir(baseDir);
            const screenshotFiles = files
                .filter(f => f.startsWith(`${stepNumber}_screenshot`) && f.endsWith('.jpg'))
                .sort((a, b) => {
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

        const domPath = path.join(baseDir, `${stepNumber}_dom.json`);
        if (await fs.pathExists(domPath)) {
            artifacts.dom = (await fs.readJson(domPath)) as Record<string, unknown>;
        }

        const ariaPath = path.join(baseDir, `${stepNumber}_aria.json`);
        if (await fs.pathExists(ariaPath)) {
            artifacts.accessibility = (await fs.readJson(ariaPath)) as Record<string, unknown>;
        }

        const tracePath = path.join(baseDir, `${stepNumber}_trace.json`);
        if (await fs.pathExists(tracePath)) {
            artifacts.trace = (await fs.readJson(tracePath)) as Record<string, unknown> & Partial<StepTrace>;
        }

        return artifacts;
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null;
    }
}
