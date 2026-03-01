import { FormInput } from '../ui/FormInput';
import type { FieldRenderProps } from '../../config/platformRegistry';
import type { IosPlatformConfig } from '../../../domain/types/PlatformConfig';

export function IosPlatformFields({ value, onChange, errors, disabled }: FieldRenderProps): React.ReactElement {
  const iosValue = value as Omit<IosPlatformConfig, 'platform'>;

  return (
    <div className="flex flex-col gap-2">
      <FormInput
        label="Bundle ID"
        placeholder="com.example.App"
        value={iosValue.bundleId || ''}
        onChange={(v) => onChange({ ...iosValue, bundleId: v })}
        error={errors['bundleId']}
        disabled={disabled}
        autoFocus
      />
      <FormInput
        label="Appium Server URL"
        optional
        placeholder="http://localhost:4723"
        value={iosValue.appiumUrl || ''}
        onChange={(v) => {
          const { appiumUrl: _, ...rest } = iosValue;
          onChange(v ? { ...rest, appiumUrl: v } : rest);
        }}
        error={errors['appiumUrl']}
        disabled={disabled}
        hint={<>Defaults to <code className="bg-gray-100 px-1 py-0 rounded">http://localhost:4723</code> if not set</>}
      />
      <FormInput
        label="Device UDID"
        optional
        placeholder="00008101-000A1234ABCD001E"
        value={iosValue.deviceUdid || ''}
        onChange={(v) => {
          const { deviceUdid: _, ...rest } = iosValue;
          onChange(v ? { ...rest, deviceUdid: v } : rest);
        }}
        disabled={disabled}
        hint={<>Use <code className="bg-gray-100 px-1 py-0 rounded">xcrun xctrace list devices</code> to list connected devices</>}
      />
    </div>
  );
}
