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
}
