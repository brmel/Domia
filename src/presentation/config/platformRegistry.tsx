import type { BasePlatformConfig, PlatformType } from '../../domain/types/PlatformConfig';
import { WebPlatformFields } from '../components/platform-fields/WebPlatformFields';
import { ElectronPlatformFields } from '../components/platform-fields/ElectronPlatformFields';

/**
 * Props passed to platform-specific field renderers
 */
export interface FieldRenderProps {
  value: any;
  onChange: (value: any) => void;
  errors: Record<string, string>;
  disabled: boolean;
}

/**
 * Platform definition interface
 * Each platform must implement this
 */
export interface PlatformDefinition<T extends BasePlatformConfig> {
  type: T['platform'];
  label: string;
  description: string;
  icon: string;
  
  // Custom field renderer component
  renderFields: React.ComponentType<FieldRenderProps>;
  
  // Default values for new instances
  defaultValues: Omit<T, 'platform' | 'prompt'>;
}

/**
 * Central registry of all supported platforms
 * Add new platforms here
 */
export const platformRegistry: Record<PlatformType, PlatformDefinition<any>> = {
  web: {
    type: 'web',
    label: 'Web Browser',
    description: 'Test web applications and websites',
    icon: '🌐',
    renderFields: WebPlatformFields,
    defaultValues: {
      url: '',
    },
  },
  
  electron: {
    type: 'electron',
    label: 'Electron App',
    description: 'Test Electron desktop applications',
    icon: '⚡',
    renderFields: ElectronPlatformFields,
    defaultValues: {
      connection: {
        type: 'cdp',
        cdpUrl: 'http://localhost:9222',
      },
    },
  },
} as const;

/**
 * Get all available platforms
 */
export function getAvailablePlatforms(): PlatformDefinition<any>[] {
  return Object.values(platformRegistry);
}

/**
 * Get specific platform definition
 */
export function getPlatformDefinition(type: PlatformType): PlatformDefinition<any> {
  return platformRegistry[type];
}
