import type {
  BasePlatformConfig,
  WebPlatformConfig,
  ElectronPlatformConfig,
  AndroidPlatformConfig,
  IosPlatformConfig,
} from '../../domain/types/PlatformConfig';
import { WebPlatformFields } from '../components/platform/WebPlatformFields';
import { ElectronPlatformFields } from '../components/platform/ElectronPlatformFields';
import { AndroidPlatformFields } from '../components/platform/AndroidPlatformFields';
import { IosPlatformFields } from '../components/platform/IosPlatformFields';
import { WebConfigSchema, ElectronConfigSchema, AndroidConfigSchema, IosConfigSchema } from '../../shared/validation/platforms';
import { z } from 'zod';

export type UIPlatformType = 'web' | 'electron' | 'android' | 'ios';

export type PlatformFieldValue =
  | Omit<WebPlatformConfig, 'platform'>
  | Omit<ElectronPlatformConfig, 'platform'>
  | Omit<AndroidPlatformConfig, 'platform'>
  | Omit<IosPlatformConfig, 'platform'>;

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
  available?: boolean;

  renderFields: React.ComponentType<FieldRenderProps>;
  validate: (value: PlatformFieldValue) => Record<string, string>;

  defaultValues: Omit<T, 'platform'>;
}

function zodValidate(schema: z.ZodTypeAny, platform: string, value: PlatformFieldValue): Record<string, string> {
    const result = schema.safeParse({ platform, ...value });
    if (result.success) return {};
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
        const path = issue.path.filter((p) => p !== 'platform').join('.');
        if (path) errors[path] = issue.message;
    }
    return errors;
}

export const platformRegistry: Record<UIPlatformType, PlatformDefinition<BasePlatformConfig> & { defaultValues: PlatformFieldValue }> = {
  web: {
    type: 'web',
    label: 'Web Browser',
    description: 'Automate web applications and websites',
    icon: '🌐',
    renderFields: WebPlatformFields,
    validate: (v) => zodValidate(WebConfigSchema, 'web', v),
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
    validate: (v) => zodValidate(ElectronConfigSchema, 'electron', v),
    defaultValues: {
      connection: {
        type: 'cdp',
        cdpUrl: 'http://localhost:9222',
      },
    },
  },

  android: {
    type: 'android',
    label: 'Android',
    description: 'Automate Android apps via Appium',
    icon: '📱',
    available: false,
    renderFields: AndroidPlatformFields,
    validate: (v) => zodValidate(AndroidConfigSchema, 'android', v),
    defaultValues: {
      appPackage: '',
    },
  },

  ios: {
    type: 'ios',
    label: 'iOS',
    description: 'Automate iOS apps via Appium',
    icon: '🍎',
    available: false,
    renderFields: IosPlatformFields,
    validate: (v) => zodValidate(IosConfigSchema, 'ios', v),
    defaultValues: {
      bundleId: '',
    },
  },
};

export function getAvailablePlatforms(): Array<PlatformDefinition<BasePlatformConfig>> {
  return Object.values(platformRegistry);
}
