import type { DomiaConfig } from '@shared/config-types';

export interface IConfigService {
    get(): DomiaConfig;
    update(updates: Partial<DomiaConfig>): void;
}
