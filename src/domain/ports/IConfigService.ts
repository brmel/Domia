import type { DomiaConfig } from '../types/DomiaConfig';

export interface IConfigService {
    get(): DomiaConfig;
    update(updates: Partial<DomiaConfig>): void;
}
