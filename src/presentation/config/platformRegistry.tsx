import type {
  BasePlatformConfig,
  WebPlatformConfig,
  ElectronPlatformConfig,
} from '../../domain/types/PlatformConfig';
import { WebPlatformFields } from '../components/platform-fields/WebPlatformFields';
import { ElectronPlatformFields } from '../components/platform-fields/ElectronPlatformFields';

export type PlatformFieldValue =
  | Omit<WebPlatformConfig, 'platform'>
  | Omit<ElectronPlatformConfig, 'platform'>;

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
  
  renderFields: React.ComponentType<FieldRenderProps>;
  
  defaultValues: Omit<T, 'platform'>;
}

/**
 * Central registry of all supported platforms
 * Add new platforms here
 */
type WebFieldValue = Omit<WebPlatformConfig, 'platform'>;
type ElectronFieldValue = Omit<ElectronPlatformConfig, 'platform'>;

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
