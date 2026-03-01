import { FormInput } from '../ui/FormInput';
import type { FieldRenderProps } from '../../config/platformRegistry';
import type { AndroidPlatformConfig } from '../../../domain/types/PlatformConfig';

export function AndroidPlatformFields({ value, onChange, errors, disabled }: FieldRenderProps): React.ReactElement {
  const androidValue = value as Omit<AndroidPlatformConfig, 'platform'>;

  return (
    <div className="flex flex-col gap-2">
      <FormInput
        label="App Package"
        placeholder="com.example.app"
        value={androidValue.appPackage || ''}
        onChange={(v) => onChange({ ...androidValue, appPackage: v })}
        error={errors['appPackage']}
        disabled={disabled}
        autoFocus
      />
      <FormInput
        label="Appium Server URL"
        optional
        placeholder="http://localhost:4723"
        value={androidValue.appiumUrl || ''}
        onChange={(v) => {
          const { appiumUrl: _, ...rest } = androidValue;
          onChange(v ? { ...rest, appiumUrl: v } : rest);
        }}
        error={errors['appiumUrl']}
        disabled={disabled}
        hint={<>Defaults to <code className="bg-gray-100 px-1 py-0 rounded">http://localhost:4723</code> if not set</>}
      />
      <FormInput
        label="Device Serial"
        optional
        placeholder="emulator-5554"
        value={androidValue.deviceSerial || ''}
        onChange={(v) => {
          const { deviceSerial: _, ...rest } = androidValue;
          onChange(v ? { ...rest, deviceSerial: v } : rest);
        }}
        disabled={disabled}
        hint={<>Use <code className="bg-gray-100 px-1 py-0 rounded">adb devices</code> to list connected devices</>}
      />
    </div>
  );
}
