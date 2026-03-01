import type {
  BasePlatformConfig,
  WebPlatformConfig,
  ElectronPlatformConfig,
} from '../../domain/types/PlatformConfig';
import { WebPlatformFields } from '../components/platform/WebPlatformFields';
import { ElectronPlatformFields } from '../components/platform/ElectronPlatformFields';

/** Platforms that currently have full UI support (form fields, etc.). */
export type UIPlatformType = 'web' | 'electron';

export type PlatformFieldValue =
  | Omit<WebPlatformConfig, 'platform'>
  | Omit<ElectronPlatformConfig, 'platform'>;

export interface FieldRenderProps {
  value: PlatformFieldValue;
  onChange: (value: PlatformFieldValue) => void;
  errors: Record<string, string>;
  disabled: boolean;
}

export interface PlatformDefinition<T extends BasePlatformConfig> {
  type: T['platform'];
  label: string;
  description: string;
  icon: string;
  
  renderFields: React.ComponentType<FieldRenderProps>;
  
  defaultValues: Omit<T, 'platform'>;
}

export const platformRegistry: Record<UIPlatformType, PlatformDefinition<BasePlatformConfig> & { defaultValues: PlatformFieldValue }> = {
  web: {
    type: 'web',
    label: 'Web Browser',
    description: 'Automate web applications and websites',
    icon: '🌐',
    renderFields: WebPlatformFields,
    defaultValues: {
      url: 'https://ibraverse.ca',
    },
  },
  
  electron: {
    type: 'electron',
    label: 'Electron App',
    description: 'Automate Electron desktop applications',
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

export function getAvailablePlatforms(): Array<PlatformDefinition<BasePlatformConfig>> {
  return Object.values(platformRegistry);
}
