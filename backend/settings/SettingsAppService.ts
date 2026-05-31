import { inject, injectable } from 'tsyringe';
import type { DomiaConfig } from '@shared/contracts/config';
import type { IConfigService } from '@domain/ports/platform/IConfigService';

@injectable()
export class SettingsAppService {
    constructor(
        @inject('IConfigService') private readonly configService: IConfigService,
    ) {}

    get(): DomiaConfig {
        return this.configService.get();
    }

    update(config: DomiaConfig): void {
        this.configService.update(config);
    }
}