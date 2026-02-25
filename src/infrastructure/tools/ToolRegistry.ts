import type { PlatformType } from '@domain/types/PlatformConfig';
import type { ToolSpec } from './ToolSpec';

export class ToolRegistry {
    private readonly specs: ToolSpec[] = [];

    register(spec: ToolSpec): void {
        this.specs.push(spec);
    }

    registerAll(specs: ToolSpec[]): void {
        for (const spec of specs) this.register(spec);
    }

    getForPlatform(platform: PlatformType): ToolSpec[] {
        return this.specs.filter((s) => !s.platforms || s.platforms.includes(platform));
    }

    getAll(): ToolSpec[] {
        return [...this.specs];
    }

    getByName(name: string): ToolSpec | undefined {
        return this.specs.find((s) => s.name === name);
    }
}
