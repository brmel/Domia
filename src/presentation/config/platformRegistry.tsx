import type {
  BasePlatformConfig,
  PlatformType,
  WebPlatformConfig,
  ElectronPlatformConfig,
} from '../../domain/types/PlatformConfig';
import { WebPlatformFields } from '../components/platform-fields/WebPlatformFields';
import { ElectronPlatformFields } from '../components/platform-fields/ElectronPlatformFields';

export type PlatformFieldValue =
  | Omit<WebPlatformConfig, 'platform' | 'prompt'>
  | Omit<ElectronPlatformConfig, 'platform' | 'prompt'>;

/**
 * Props passed to platform-specific field renderers
 */
export interface FieldRenderProps {
  value: PlatformFieldValue;
  onChange: (value: PlatformFieldValue) => void;
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
type WebFieldValue = Omit<WebPlatformConfig, 'platform' | 'prompt'>;
type ElectronFieldValue = Omit<ElectronPlatformConfig, 'platform' | 'prompt'>;

export const platformRegistry: {
  web: PlatformDefinition<WebPlatformConfig> & { defaultValues: WebFieldValue };
  electron: PlatformDefinition<ElectronPlatformConfig> & { defaultValues: ElectronFieldValue };
} = {
  web: {
    type: 'web',
    label: 'Web Browser',
    description: 'Test web applications and websites',
    icon: '🌐',
    renderFields: WebPlatformFields,
    defaultValues: {
      url: 'https://ibraverse.ca',
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
};

/**
 * Get all available platforms
 */
export function getAvailablePlatforms(): Array<PlatformDefinition<BasePlatformConfig>> {
  return Object.values(platformRegistry);
}

/**
 * Get specific platform definition
 */
export function getPlatformDefinition(type: PlatformType): PlatformDefinition<BasePlatformConfig> {
  return platformRegistry[type];
}
