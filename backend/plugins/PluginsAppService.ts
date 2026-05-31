import { inject, injectable } from 'tsyringe';
import type { IPluginRegistry } from '@domain/ports/plugins/IPluginRegistry';
import type { IConfigService } from '@domain/ports/platform/IConfigService';

interface PluginInfo {
    readonly name: string;
    readonly toolNames: readonly string[];
    readonly enabled: boolean;
}

@injectable()
export class PluginsAppService {
    constructor(
        @inject('IPluginRegistry') private readonly registry: IPluginRegistry,
        @inject('IConfigService') private readonly configService: IConfigService,
    ) {}

    list(): PluginInfo[] {
        const tools = this.registry.getAllTools();
        const cfg = this.configService.get().plugins;
        return [
            { name: 'shell', toolNames: ['shell_exec'], enabled: cfg.shell.enabled },
            ...tools.map((t) => ({ name: t.name, toolNames: [t.name], enabled: true })),
        ];
    }

    setShellEnabled(enabled: boolean): void {
        this.configService.updateTransient({ plugins: { shell: { enabled } } });
    }
}
