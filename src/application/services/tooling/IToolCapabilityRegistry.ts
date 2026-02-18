import type { PlatformType } from '@domain/tools/ToolMetadata';
import type { ToolDescriptor } from './ToolContracts';

export interface IToolCapabilityRegistry {
    getToolDescriptors(platform?: PlatformType): ToolDescriptor[];
}
