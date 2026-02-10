import { injectable, inject } from 'tsyringe';
import fs from 'fs-extra';
import path from 'path';
import { ConfigService } from '../config/ConfigService';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';

import { IStorageService } from '@domain/ports/IStorageService';

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

        // Save Screenshot
        if (frame.vision.screenshot) {
            const filename = `${stepNumber}_screenshot.jpg`; // Assuming jpg from VisionSensor
            const filePath = path.join(baseDir, filename);
            await fs.writeFile(filePath, frame.vision.screenshot);
            assets['screenshot'] = filePath;
        }

        // Save DOM
        if (frame.semantic.dom) {
            const filename = `${stepNumber}_dom.json`;
            const filePath = path.join(baseDir, filename);
            await fs.writeJson(filePath, frame.semantic.dom, { spaces: 2 });
            assets['dom'] = filePath;
        }

        // Save Accessibility
        if (frame.semantic.accessibility) {
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

    async getStepArtifacts(runId: string, stepNumber: number): Promise<{
        screenshot?: string;
        dom?: any;
        accessibility?: any;
        trace?: any;
    }> {
        const config = this.configService.get();
        const baseDir = path.resolve(config.paths.artifactsDir, runId, 'steps');

        // Security check: ensure baseDir is within artifactsDir to prevent traversal
        if (!baseDir.startsWith(path.resolve(config.paths.artifactsDir))) {
            throw new Error("Invalid runId");
        }

        const artifacts: any = {};

        // 1. Screenshot
        const screenshotPath = path.join(baseDir, `${stepNumber}_screenshot.jpg`);
        if (await fs.pathExists(screenshotPath)) {
            const buffer = await fs.readFile(screenshotPath);
            artifacts.screenshot = `data:image/jpeg;base64,${buffer.toString('base64')}`;
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

        return artifacts;
    }
}
