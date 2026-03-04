import { FormInput } from '../ui/FormInput';
import type { FieldRenderProps } from '../../config/platformRegistry';
import type { WebPlatformConfig } from '@domain/types/PlatformConfig';

export function WebPlatformFields({ value, onChange, errors, disabled }: FieldRenderProps): React.ReactElement {
  const webValue = value as Omit<WebPlatformConfig, 'platform'>;

  return (
    <FormInput
      label="Target URL"
      placeholder="google.com"
      value={webValue.url || ''}
      onChange={(v) => onChange({ ...webValue, url: v })}
      error={errors['url']}
      disabled={disabled}
      autoFocus
    />
  );
}
