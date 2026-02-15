import { cn } from '../../../lib/utils';
import type { FieldRenderProps } from '../../config/platformRegistry';
import type { WebPlatformConfig } from '../../../domain/types/PlatformConfig';

export function WebPlatformFields({ value, onChange, errors, disabled }: FieldRenderProps): React.ReactElement {
  const webValue = value as Omit<WebPlatformConfig, 'platform'>;
  const url = webValue.url || '';

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Target URL
      </label>
      <div className="relative group">
        <input
          className={cn(
            "w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all font-mono",
            errors['url']
              ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 group-hover:border-gray-400"
          )}
          type="text"
          placeholder="google.com"
          value={url}
          onChange={(e) => onChange({ ...webValue, url: e.target.value })}
          disabled={disabled}
          autoFocus
        />
        {errors['url'] && (
          <span className="absolute right-3 top-2.5 text-xs text-red-500 font-medium">
            {errors['url']}
          </span>
        )}
      </div>
    </div>
  );
}
